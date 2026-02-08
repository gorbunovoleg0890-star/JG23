import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ClipboardList,
  FileText,
  Gavel,
  Plus,
  Trash2
} from 'lucide-react';
import themis from './assets/themis.svg';
import lawBook from './assets/law-book.svg';
import { createGorbunovPreset } from './presets/gorbunov';
import {
  crimeCategories,
  intentTypes,
  punishmentTypes,
  ukArticles,
  getArticleOptions,
  getPartsForArticle,
  getPointsForArticlePart
} from './data/ukData.js';

const emptyCrime = () => ({
  id: crypto.randomUUID(),
  date: '',
  articleId: '',
  partId: '',
  pointId: '',
  category: 'средней тяжести',
  intent: 'умышленное'
});

const emptyPriorCrime = () => ({
  id: crypto.randomUUID(),
  date: '',
  articleId: '',
  partId: '',
  pointId: '',
  category: 'средней тяжести',
  intent: 'умышленное',
  juvenile: false
});

const emptyPunishment = () => ({
  mainType: 'imprisonment',
  mainReal: true,
  mainConditional: false,
  mainTermYears: 0,
  mainTermMonths: 0,
  conditionalCancelledDate: '',
  probationYears: 0,
  probationMonths: 0,
  deferment: false,
  defermentCancelledDate: '',
  udoDate: '',
  mainEndDate: '',
  additionalType: '',
  additionalEndDate: ''
});

const emptyConviction = () => ({
  id: crypto.randomUUID(),
  verdictDate: '',
  legalDate: '',
  pre2013: false,
  crimes: [emptyPriorCrime()],
  punishment: emptyPunishment()
});

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('ru-RU') : '');

const formatArticleRef = (crime) => {
  if (!crime?.articleId) return '—';
  const part = crime.partId ? ` ч. ${crime.partId}` : '';
  const point = crime.pointId ? ` п. ${crime.pointId}` : '';
  return `ст. ${crime.articleId}${part}${point}`;
};

const addYears = (date, years) => {
  if (!date) return '';
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next.toISOString().slice(0, 10);
};

const addMonths = (date, months) => {
  if (!date) return '';
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next.toISOString().slice(0, 10);
};

const getCategoryTermYears = (category, pre2013) => {
  if (category === 'небольшой тяжести' || category === 'средней тяжести') {
    return 3;
  }
  if (category === 'тяжкое') {
    return pre2013 ? 6 : 8;
  }
  if (category === 'особо тяжкое') {
    return pre2013 ? 8 : 10;
  }
  return 3;
};

const getJuvenileTerm = (category, isImprisonment) => {
  if (!isImprisonment) {
    return { months: 6 };
  }
  if (category === 'тяжкое' || category === 'особо тяжкое') {
    return { years: 3 };
  }
  return { years: 1 };
};

const getExpungementDate = (conviction) => {
  const { punishment, crimes, pre2013 } = conviction;
  const crimeCategory = crimes[0]?.category ?? 'средней тяжести';
  const isImprisonment = punishment.mainType === 'imprisonment' || punishment.mainType === 'life-imprisonment';
  
  // Effective end date: UDO takes precedence, then mainEndDate, and additionalEndDate if later
  const mainEffectiveDate = punishment.udoDate || punishment.mainEndDate;
  const endDate = punishment.additionalEndDate && punishment.additionalEndDate > mainEffectiveDate
    ? punishment.additionalEndDate
    : mainEffectiveDate;

  if (!endDate) return '';

  if (crimes.some((crime) => crime.juvenile)) {
    const juvenileTerm = getJuvenileTerm(crimeCategory, isImprisonment);
    if (juvenileTerm.months) {
      return addMonths(endDate, juvenileTerm.months);
    }
    return addYears(endDate, juvenileTerm.years);
  }

  if (punishment.mainConditional) {
    return endDate;
  }

  if (!isImprisonment) {
    return addYears(endDate, 1);
  }

  return addYears(endDate, getCategoryTermYears(crimeCategory, pre2013));
};

// Helper: Get effective end date for expungement (considering UDO and additional punishment)
const getEffectiveEndDate = (punishment) => {
  if (!punishment) return '';
  const mainEffectiveDate = punishment.udoDate || punishment.mainEndDate;
  return punishment.additionalEndDate && punishment.additionalEndDate > mainEffectiveDate
    ? punishment.additionalEndDate
    : mainEffectiveDate;
};

// Helper: Find which merge operation controls this conviction node (if any)
const getGoverningOperationForConviction = (convictionId, mergeOps) => {
  if (!mergeOps) return null;
  return mergeOps.find(op => {
    const childConvictionIds = op.childNodeIds
      .filter(id => id.startsWith('conviction:'))
      .map(id => id.replace('conviction:', ''));
    return childConvictionIds.includes(convictionId);
  });
};

const getPriorCrimes = (convictions) =>
  convictions.flatMap((conviction) =>
    conviction.crimes.map((crime) => ({ crime, conviction }))
  );

const isConvictionEligible = (entry, newCrimeDate) => {
  const { crime, conviction } = entry;
  const { punishment } = conviction;
  const expungementDate = getExpungementDate(conviction);
  const hasActiveRecord = !expungementDate || newCrimeDate < expungementDate;
  const conditionalValid =
    !punishment.mainConditional || Boolean(punishment.conditionalCancelledDate);
  const defermentValid =
    !punishment.deferment || Boolean(punishment.defermentCancelledDate);

  return (
    crime.intent === 'умышленное' &&
    crime.category !== 'небольшой тяжести' &&
    !crime.juvenile &&
    hasActiveRecord &&
    conditionalValid &&
    defermentValid
  );
};

const getConvictionRecidivismStatus = (conviction, newCrimeDate, mergeGroups) => {
  // Найти группу, в которой находится эта судимость
  const groupWithConviction = mergeGroups?.find(g => 
    g.parentId === conviction.id || g.selectedIds.includes(conviction.id)
  );

  let expungementDate;
  if (groupWithConviction && groupWithConviction.parentId === conviction.id) {
    // Это основной приговор - использовать соединённое наказание
    expungementDate = getExpungementDate({ ...conviction, punishment: groupWithConviction.mergedPunishment });
  } else {
    // Обычный приговор или судимость в группе - использовать свой срок
    expungementDate = getExpungementDate(conviction);
  }
  const isActive = !expungementDate || newCrimeDate < expungementDate;

  // Если судимость погашена
  if (!isActive) {
    return {
      eligible: false,
      reason: 'Рецидив не установлен: судимость погашена на дату нового преступления.',
      expungementDate,
      groupId: groupWithConviction?.id
    };
  }

  // Проверить все преступления в этом приговоре
  const { punishment } = conviction;
  
  // Проверка несовершеннолетства
  if (conviction.crimes.some((crime) => crime.juvenile)) {
    return {
      eligible: false,
      reason: 'Не учитывается для рецидива: преступление совершено до 18 лет.',
      expungementDate,
      groupId: groupWithConviction?.id
    };
  }

  // Проверка формы вины
  if (conviction.crimes.some((crime) => crime.intent !== 'умышленное')) {
    return {
      eligible: false,
      reason: 'Не учитывается для рецидива: неумышленное преступление.',
      expungementDate,
      groupId: groupWithConviction?.id
    };
  }

  // Проверка категории
  if (conviction.crimes.some((crime) => crime.category === 'небольшой тяжести')) {
    return {
      eligible: false,
      reason: 'Не учитывается для рецидива: преступление небольшой тяжести.',
      expungementDate,
      groupId: groupWithConviction?.id
    };
  }

  // Проверка условного осуждения
  if (punishment.mainConditional && !punishment.conditionalCancelledDate) {
    return {
      eligible: false,
      reason: 'Не учитывается для рецидива: условное осуждение не отменено.',
      expungementDate,
      groupId: groupWithConviction?.id
    };
  }

  // Проверка отсрочки
  if (punishment.deferment && !punishment.defermentCancelledDate) {
    return {
      eligible: false,
      reason: 'Не учитывается для рецидива: отсрочка не отменена.',
      expungementDate,
      groupId: groupWithConviction?.id
    };
  }

  // Все проверки пройдены
  return {
    eligible: true,
    reason: 'Учитывается.',
    expungementDate,
    groupId: groupWithConviction?.id
  };
};

const getRecidivismAssessment = (newCrime, eligibleEntries) => {
  // eligibleEntries - массив объектов { crime, conviction }
  // где conviction может содержать punishment либо из базового приговора, либо из mergedPunishment узла
  
  if (newCrime.intent !== 'умышленное') {
    return {
      type: 'Нет рецидива',
      reason: 'Новое преступление совершено по неосторожности (ч. 1 ст. 18 УК РФ).',
      hasRecidivism: false
    };
  }

  if (eligibleEntries.length === 0) {
    return {
      type: 'Нет рецидива',
      reason: 'Нет действующих судимостей за умышленные преступления средней/тяжкой категории.',
      hasRecidivism: false
    };
  }

  const severePrior = eligibleEntries.filter(
    ({ crime }) => crime.category === 'тяжкое' || crime.category === 'особо тяжкое'
  );
  const mediumPrior = eligibleEntries.filter(
    ({ crime }) => crime.category === 'средней тяжести'
  );
  const realImprisonmentPrior = eligibleEntries.filter(
    ({ conviction }) => conviction.punishment.mainType === 'imprisonment' && conviction.punishment.mainReal
  );
  const severeImprisonmentPrior = realImprisonmentPrior.filter(
    ({ crime }) => crime.category === 'тяжкое' || crime.category === 'особо тяжкое'
  );
  const heavyImprisonmentPrior = realImprisonmentPrior.filter(
    ({ crime }) => crime.category === 'тяжкое'
  );

  // ст.18 ч.3 п.б - особо тяжкое новое преступление + требуемые прошлые
  if (newCrime.category === 'особо тяжкое' && (heavyImprisonmentPrior.length >= 2 || severeImprisonmentPrior.length >= 1)) {
    return {
      type: 'Особо опасный рецидив',
      reason: 'Особо тяжкое новое преступление и тяжкие/особо тяжкие судимости с реальным наказанием (ч. 3 ст. 18 УК РФ).',
      hasRecidivism: true
    };
  }

  // ст.18 ч.3 - два тяжких с реальным наказанием
  if (newCrime.category === 'тяжкое' && heavyImprisonmentPrior.length >= 2) {
    return {
      type: 'Особо опасный рецидив',
      reason: 'Два и более тяжких умышленных преступления с реальным лишением свободы (ч. 3 ст. 18 УК РФ).',
      hasRecidivism: true
    };
  }

  // ст.18 ч.2 - два средней тяжести + реальное или тяжкое/особо тяжкое
  if (newCrime.category === 'тяжкое' && mediumPrior.length >= 2 && realImprisonmentPrior.length >= 2) {
    return {
      type: 'Опасный рецидив',
      reason: 'Два и более умышленных преступления средней тяжести с лишением свободы (ч. 2 ст. 18 УК РФ).',
      hasRecidivism: true
    };
  }

  // ст.18 ч.2 - тяжкое новое + хотя бы одно тяжкое/особо тяжкое
  if (newCrime.category === 'тяжкое' && severePrior.length >= 1) {
    return {
      type: 'Опасный рецидив',
      reason: 'Новое тяжкое преступление при наличии тяжкой/особо тяжкой судимости (ч. 2 ст. 18 УК РФ).',
      hasRecidivism: true
    };
  }

  // ст.18 ч.1 - простой рецидив: хотя бы одна действующая судимость за умышленное
  return {
    type: 'Простой рецидив',
    reason: 'Наличие действующей судимости за умышленное преступление (ч. 1 ст. 18 УК РФ).',
    hasRecidivism: true
  };
};

const SectionCard = ({ title, icon: Icon, children }) => (
  <section className="glass-panel rounded-3xl p-6 space-y-6">
    <div className="flex items-center gap-3">
      <span className="rounded-full bg-law-200/20 p-2 text-law-100">
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="section-title">{title}</h2>
    </div>
    {children}
  </section>
);

const Field = ({ label, children }) => (
  <label className="flex flex-col gap-2 text-sm text-law-100">
    <span className="font-medium">{label}</span>
    {children}
  </label>
);

const Select = ({ value, onChange, options, placeholder }) => (
  <select
    value={value}
    onChange={onChange}
    className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm shadow-sm"
  >
    <option value="">{placeholder}</option>
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

export default function App() {
  const [birthDate, setBirthDate] = useState('');
  const [newCrimes, setNewCrimes] = useState([emptyCrime()]);
  const [convictions, setConvictions] = useState([emptyConviction()]);
  const [mergeOps, setMergeOps] = useState([]);
  const [creatingOp, setCreatingOp] = useState({
    basis: 'ч. 5 ст. 69 УК РФ',
    childNodeIds: [],
    parentNodeId: ''
  });

  // ==================== Graph helpers ====================
  
  // Build node graph: maps and relationships
  const nodeGraph = useMemo(() => {
    const nodesById = new Map();
    const consumedBy = new Map(); // nodeId -> mergeOpId that consumes it
    const resultNodeById = new Map(); // mergeOpId -> resultNodeId

    // Add base nodes (convictions)
    convictions.forEach((c) => {
      const nodeId = `conviction:${c.id}`;
      nodesById.set(nodeId, {
        id: nodeId,
        type: 'base',
        conviction: c,
        verdictDate: c.verdictDate
      });
    });

    // Add merge operations and their result nodes
    mergeOps.forEach((op) => {
      const resultNodeId = `merge:${op.id}`;
      resultNodeById.set(op.id, resultNodeId);
      
      // Mark all children as consumed
      op.childNodeIds.forEach((childId) => {
        consumedBy.set(childId, op.id);
      });

      // Find parent node to get its verdictDate
      const parentNode = nodesById.get(op.parentNodeId);
      const parentVerdictDate = parentNode
        ? (parentNode.type === 'base' ? parentNode.conviction.verdictDate : parentNode.verdictDate)
        : '';

      // Create virtual node
      nodesById.set(resultNodeId, {
        id: resultNodeId,
        type: 'virtual',
        mergeOp: op,
        verdictDate: parentVerdictDate,
        childNodeIds: op.childNodeIds,
        parentNodeId: op.parentNodeId
      });
    });

    return { nodesById, consumedBy, resultNodeById };
  }, [convictions, mergeOps]);

  // Get node by ID (base or virtual)
  const getNode = (nodeId) => nodeGraph.nodesById.get(nodeId);

  // Get all underlying base convictions for a node (recursively)
  const getUnderlyingConvictions = (nodeId) => {
    const node = getNode(nodeId);
    if (!node) return [];
    if (node.type === 'base') return [node.conviction];
    
    // Virtual node: recursively get from children
    const result = [];
    node.childNodeIds.forEach((childId) => {
      result.push(...getUnderlyingConvictions(childId));
    });
    return result;
  };

  // Get all underlying crimes for category calculation
  const getUnderlyingCrimes = (nodeId) => {
    const convictions = getUnderlyingConvictions(nodeId);
    return convictions.flatMap(c => c.crimes);
  };

  // Get max category from all underlying crimes
  const getMaxCategory = (nodeId) => {
    const crimes = getUnderlyingCrimes(nodeId);
    const categoryOrder = ['небольшой тяжести', 'средней тяжести', 'тяжкое', 'особо тяжкое'];
    const maxIndex = Math.max(...crimes.map(c => categoryOrder.indexOf(c.category)), -1);
    return maxIndex >= 0 ? categoryOrder[maxIndex] : 'средней тяжести';
  };

  // Get root nodes (not consumed in any operation)
  const getRootNodeIds = useMemo(() => {
    return Array.from(nodeGraph.nodesById.keys()).filter(
      (nodeId) => !nodeGraph.consumedBy.has(nodeId)
    );
  }, [nodeGraph]);

  // Get root nodes that are virtual (results of operations)
  const getRootMergeOpIds = useMemo(() => {
    return mergeOps
      .filter((op) => !nodeGraph.consumedBy.has(`merge:${op.id}`))
      .map((op) => op.id);
  }, [mergeOps, nodeGraph.consumedBy]);

  // Helper: Find operation where a conviction is the parent (основной узел)
  const getParentOperation = (convictionId) => {
    return mergeOps.find((op) => {
      const parentNodeId = op.parentNodeId;
      return parentNodeId === `conviction:${convictionId}`;
    });
  };

  // Helper: Get effective punishment (from operation if parent, else from conviction)
  const getEffectivePunishment = (conviction) => {
    const parentOp = getParentOperation(conviction.id);
    if (parentOp) return parentOp.mergedPunishment;
    return conviction.punishment;
  };

  // Helper: Get expungement date using effective punishment
  // Helper: Get expungement date using effective punishment and operation awareness for child nodes
  const getConvictionExpungementDate = (conviction) => {
    const nodeId = `conviction:${conviction.id}`;

    // If this conviction is a child in an operation, check basis
    const consumingOpId = nodeGraph.consumedBy.get(nodeId);
    if (consumingOpId) {
      const consumingOp = mergeOps.find(op => op.id === consumingOpId);
      if (consumingOp) {
        // If merged by ч.5 ст.69 -> do not compute separately (see parent)
        if (consumingOp.basis.includes('69')) {
          return '';
        }

        // If conditional was cancelled by ст.70+74 and this conviction was conditional ->
        // expungement equals expungement of the parent conviction (accounting chain)
        if (consumingOp.basis.includes('70') && consumingOp.basis.includes('74') && conviction.punishment.mainConditional) {
          const parentNodeId = consumingOp.parentNodeId;
          if (parentNodeId && parentNodeId.startsWith('conviction:')) {
            const parentId = parentNodeId.replace('conviction:', '');
            const parentConviction = convictions.find(c => c.id === parentId);
            if (parentConviction) {
              return getConvictionExpungementDate(parentConviction);
            }
          }
        }
      }
    }

    // Default: use effective punishment (parent operation or own punishment)
    const punishment = getEffectivePunishment(conviction);
    const crimeCategory = conviction.crimes[0]?.category ?? 'средней тяжести';
    const isImprisonment = punishment.mainType === 'imprisonment' || punishment.mainType === 'life-imprisonment';
    const actualEndDate = punishment.udoDate || punishment.mainEndDate;
    const endDate = punishment.additionalEndDate && punishment.additionalEndDate > actualEndDate
      ? punishment.additionalEndDate
      : actualEndDate;

    if (!endDate) return '';

    if (conviction.crimes.some((crime) => crime.juvenile)) {
      const juvenileTerm = getJuvenileTerm(crimeCategory, isImprisonment);
      if (juvenileTerm.months) {
        return addMonths(endDate, juvenileTerm.months);
      }
      return addYears(endDate, juvenileTerm.years);
    }

    if (punishment.mainConditional) {
      return endDate;
    }

    if (!isImprisonment) {
      return addYears(endDate, 1);
    }

    return addYears(endDate, getCategoryTermYears(crimeCategory, conviction.pre2013));
  };

  // Helper: Check if conviction is eligible for recidivism (using effective punishment)
  const isConvictionEligibleForRecidivism = (entry, newCrimeDate) => {
    const { crime, conviction } = entry;
    const punishment = getEffectivePunishment(conviction);
    const expungementDate = getConvictionExpungementDate(conviction);
    const hasActiveRecord = !expungementDate || newCrimeDate < expungementDate;
    
    // Check conditional: either no conditional, or it's cancelled, OR it's auto-cancelled in ст.70+74
    const nodeId = `conviction:${conviction.id}`;
    const isAutoCancelled = isConditionalAutoCancelled(nodeId);
    const conditionalValid =
      !punishment.mainConditional || Boolean(punishment.conditionalCancelledDate) || isAutoCancelled;
    
    const defermentValid =
      !punishment.deferment || Boolean(punishment.defermentCancelledDate);

    return (
      crime.intent === 'умышленное' &&
      crime.category !== 'небольшой тяжести' &&
      !crime.juvenile &&
      hasActiveRecord &&
      conditionalValid &&
      defermentValid
    );
  };

  // Helper: Get all operations where a conviction is a child node
  const getConvictionChildOperations = (convictionId) => {
    const nodeId = `conviction:${convictionId}`;
    const consumingOpId = nodeGraph.consumedBy.get(nodeId);
    if (!consumingOpId) return [];
    
    const consumingOp = mergeOps.find(op => op.id === consumingOpId);
    return consumingOp ? [consumingOp] : [];
  };

  // Helper: Get the operation that consumed the result of a parent operation
  const getParentOperationConsumingOp = (opId) => {
    const resultNodeId = `merge:${opId}`;
    const consumingOpId = nodeGraph.consumedBy.get(resultNodeId);
    if (!consumingOpId) return null;
    return mergeOps.find(op => op.id === consumingOpId);
  };

  // Helper: Recursively get the chain of operations starting from a conviction's parent operation
  const getOperationChain = (convictionId) => {
    const parentOp = getParentOperation(convictionId);
    if (!parentOp) return null;
    
    const chain = [parentOp];
    let currentOp = parentOp;
    
    // Keep going up the chain
    while (true) {
      const consumingOp = getParentOperationConsumingOp(currentOp.id);
      if (!consumingOp) break;
      chain.push(consumingOp);
      currentOp = consumingOp;
    }
    
    return chain;
  };

  // Check if mergeOp can be deleted (its result is not used in another op)
  const canDeleteMergeOp = (opId) => {
    const resultNodeId = `merge:${opId}`;
    return !nodeGraph.consumedBy.has(resultNodeId) || nodeGraph.consumedBy.get(resultNodeId) === undefined;
  };

  // Find which mergeOp consumes this node's result (if any)
  const getConsumingOpId = (nodeId) => {
    return nodeGraph.consumedBy.get(nodeId);
  };

  // Get available nodes for new merge (not yet consumed)
  const getAvailableNodeIds = () => {
    return Array.from(nodeGraph.nodesById.keys()).filter(
      (nodeId) => !nodeGraph.consumedBy.has(nodeId)
    );
  };

  // Get node label for display
  const getNodeLabel = (nodeId) => {
    const node = getNode(nodeId);
    if (!node) return '?';
    
    if (node.type === 'base') {
      const idx = convictions.findIndex((c) => c.id === node.conviction.id);
      const dateStr = node.conviction.verdictDate ? ` от ${formatDate(node.conviction.verdictDate)}` : '';
      return `Приговор №${idx + 1}${dateStr}`;
    }
    
    if (node.type === 'virtual') {
      const parentLabel = getNodeLabel(node.parentNodeId);
      const basis = node.mergeOp.basis;
      return `Соединённый (${basis}) — основной: ${parentLabel}`;
    }
  };

  // Helper: get conviction index (1-based) by nodeId like 'conviction:<id>'
  const getConvictionIndexByNodeId = (nodeId) => {
    if (!nodeId || !nodeId.startsWith('conviction:')) return -1;
    const id = nodeId.replace('conviction:', '');
    return convictions.findIndex(c => c.id === id) + 1; // 1-based, returns 0 if not found
  };

  const getConvictionLabelByNodeId = (nodeId) => {
    const idx = getConvictionIndexByNodeId(nodeId);
    if (idx <= 0) return null;
    const conv = convictions[idx - 1];
    return `Приговор №${idx}${conv.verdictDate ? ` от ${formatDate(conv.verdictDate)}` : ''}`;
  };

  // Helper: Check if conditional was automatically cancelled in a ст.70+74 operation
  const isConditionalAutoCancelled = (nodeId) => {
    const node = getNode(nodeId);
    if (!node || node.type !== 'base') return false;
    
    // Check if this node is a child in an operation with basis including both 70 and 74
    const consumingOpId = nodeGraph.consumedBy.get(nodeId);
    if (!consumingOpId) return false;
    
    const consumingOp = mergeOps.find(op => op.id === consumingOpId);
    if (!consumingOp) return false;
    
    // Basis must include both '70' and '74'
    const basis = consumingOp.basis;
    return basis.includes('70') && basis.includes('74');
  };

  // Helper: Get effective end date for expungement calculation for a node
  const getNodeEndDateForExpungement = (nodeId) => {
    const node = getNode(nodeId);
    if (!node) return '';
    
    if (node.type === 'base') {
      // Check if this base node is consumed by a merge operation
      const consumingOpId = nodeGraph.consumedBy.get(nodeId);
      if (consumingOpId) {
        const consumingOp = mergeOps.find(op => op.id === consumingOpId);
        if (consumingOp) {
          // Use date from the consuming operation (влившийся узел)
          return getEffectiveEndDate(consumingOp.mergedPunishment);
        }
      }
      
      // Base node: use conviction's own punishment data
      const punishment = node.conviction.punishment;
      return getEffectiveEndDate(punishment);
    }
    
    if (node.type === 'virtual') {
      // Virtual node: use operation's merged punishment data
      return getEffectiveEndDate(node.mergeOp.mergedPunishment);
    }
    
    return '';
  };

  // Create merge operation
  const createMergeOp = () => {
    if (creatingOp.childNodeIds.length < 2 || !creatingOp.parentNodeId) return;
    
    const newOp = {
      id: crypto.randomUUID(),
      basis: creatingOp.basis,
      childNodeIds: creatingOp.childNodeIds,
      parentNodeId: creatingOp.parentNodeId,
      mergedPunishment: {
        mainType: 'imprisonment',
        mainReal: true,
        mainConditional: false,
        mainTermYears: 0,
        mainTermMonths: 0,
        conditionalCancelledDate: '',
        probationYears: 0,
        probationMonths: 0,
        deferment: false,
        defermentCancelledDate: '',
        udoDate: '',
        mainEndDate: '',
        additionalType: '',
        additionalEndDate: ''
      },
      createdAt: new Date().toISOString()
    };
    
    setMergeOps([...mergeOps, newOp]);
    setCreatingOp({
      basis: 'ч. 5 ст. 69 УК РФ',
      childNodeIds: [],
      parentNodeId: ''
    });
  };

  // Delete merge operation
  const deleteMergeOp = (opId) => {
    setMergeOps(mergeOps.filter(op => op.id !== opId));
  };

  // Update merge operation's merged punishment
  const updateOpMergedPunishment = (opId, field, value) => {
    setMergeOps(mergeOps.map(op =>
      op.id === opId
        ? { ...op, mergedPunishment: { ...op.mergedPunishment, [field]: value } }
        : op
    ));
  };

  // Calculate expungement date for any node (base or virtual)
  const getNodeExpungementDate = (nodeId) => {
    const node = getNode(nodeId);
    if (!node) return '';
    
    if (node.type === 'base') {
      // Check if this base node is a child in a merge operation
      const consumingOpId = nodeGraph.consumedBy.get(nodeId);
      if (consumingOpId) {
        const consumingOp = mergeOps.find(op => op.id === consumingOpId);
        if (consumingOp) {
          // For ст.70+74 operations (conditional cancellation):
          // use the operation's merged punishment endDate + this conviction's category term
          if (consumingOp.basis.includes('70') && consumingOp.basis.includes('74')) {
            // Get endDate from the mergedPunishment of this operation
            const actualEndDate = consumingOp.mergedPunishment.udoDate || consumingOp.mergedPunishment.mainEndDate;
            const operationEndDate = consumingOp.mergedPunishment.additionalEndDate && 
                                     consumingOp.mergedPunishment.additionalEndDate > actualEndDate
              ? consumingOp.mergedPunishment.additionalEndDate
              : actualEndDate;
            
            if (operationEndDate) {
              // Apply THIS conviction's category and pre2013 rules
              const crimeCategory = node.conviction.crimes[0]?.category ?? 'средней тяжести';
              const isImprisonment = node.conviction.punishment.mainType === 'imprisonment' || 
                                     node.conviction.punishment.mainType === 'life-imprisonment';
              
              // Check for juvenile crimes
              if (node.conviction.crimes.some((crime) => crime.juvenile)) {
                const juvenileTerm = getJuvenileTerm(crimeCategory, isImprisonment);
                if (juvenileTerm.months) {
                  return addMonths(operationEndDate, juvenileTerm.months);
                }
                return addYears(operationEndDate, juvenileTerm.years);
              }
              
              // Non-imprisonment punishment
              if (!isImprisonment) {
                return addYears(operationEndDate, 1);
              }
              
              // Imprisonment - add category term (using this conviction's pre2013)
              return addYears(operationEndDate, getCategoryTermYears(crimeCategory, node.conviction.pre2013));
            }
          }
        }
      }
      
      // Default: use conviction's own expungement date
      return getConvictionExpungementDate(node.conviction);
    }
    
    if (node.type === 'virtual') {
      const op = node.mergeOp;
      const category = getMaxCategory(nodeId);
      const crimes = getUnderlyingCrimes(nodeId);
      const isImprisonment = op.mergedPunishment.mainType === 'imprisonment' || 
                            op.mergedPunishment.mainType === 'life-imprisonment';
      const actualEndDate = op.mergedPunishment.udoDate || op.mergedPunishment.mainEndDate;
      const endDate = op.mergedPunishment.additionalEndDate && 
                     op.mergedPunishment.additionalEndDate > actualEndDate
        ? op.mergedPunishment.additionalEndDate
        : actualEndDate;

      if (!endDate) return '';

      // Check for juvenile crimes
      if (crimes.some((crime) => crime.juvenile)) {
        const juvenileTerm = getJuvenileTerm(category, isImprisonment);
        if (juvenileTerm.months) {
          return addMonths(endDate, juvenileTerm.months);
        }
        return addYears(endDate, juvenileTerm.years);
      }

      // Check for conditional sentence
      if (op.mergedPunishment.mainConditional) {
        return endDate;
      }

      // Non-imprisonment punishment
      if (!isImprisonment) {
        return addYears(endDate, 1);
      }

      // Imprisonment - add category term
      const pre2013 = getUnderlyingConvictions(nodeId).some(c => c.pre2013);
      return addYears(endDate, getCategoryTermYears(category, pre2013));
    }
    
    return '';
  };

  const priorCrimes = useMemo(() => getPriorCrimes(convictions), [convictions]);

  const convictionNumberById = useMemo(() => {
    const map = new Map();
    convictions.forEach((c, idx) => map.set(c.id, idx + 1));
    return map;
  }, [convictions]);

  const recidivismReport = useMemo(() => {
    return newCrimes.map((crime) => {
      // ========== ВЫБОР УЗЛОВ ДЛЯ РЕЦИДИВА ==========
      // Правило: учитываются ONLY root nodes (не consumed)
      // 
      // Для ч.5 ст.69: "влившиеся" nodes не учитываются отдельно. 
      // Используется ТОЛЬКО основной узел (parentNodeId virtual node-а).
      // 
      // Для ст.70/ст.70+74: основной узел используется для рецидива,
      // "влившиеся" не дают двойного учёта, но их данные (дата погашения) 
      // должны быть видны в анализе.

      const rootNodeIds = getRootNodeIds;
      
      // Для каждого root node надо понять, надо ли его учитывать в рецидиве
      // и какие преступления использовать для проверки
      const nodesToConsiderForRecidivism = [];
      
      rootNodeIds.forEach((nodeId) => {
        const node = getNode(nodeId);
        if (!node) return;

        // Base conviction: всегда учитывается, если не consumed
        if (node.type === 'base') {
          const underlyingCrimes = node.conviction.crimes;
          nodesToConsiderForRecidivism.push({
            nodeId,
            node,
            crimes: underlyingCrimes,
            isRoot: true
          });
          return;
        }

        // Virtual node (результат merge operation):
        if (node.type === 'virtual') {
          // Для ВСЕХ merge операций основной узел считается для рецидива
          // (важно для ст.70 и ч.5 ст.69, одинаково)
          const underlyingCrimes = getUnderlyingCrimes(nodeId);
          nodesToConsiderForRecidivism.push({
            nodeId,
            node,
            crimes: underlyingCrimes,
            isRoot: true,
            mergeOp: node.mergeOp
          });
        }
      });

      // Теперь для каждого узла проверим eligibility
      const eligibleNodesForRecidivism = [];
      
      nodesToConsiderForRecidivism.forEach(({ nodeId, node, crimes, mergeOp }) => {
        // Все преступления в узле должны быть умышленными и не малые
        const allCrimesValid = crimes.every((c) =>
          c.intent === 'умышленное' &&
          c.category !== 'небольшой тяжести' &&
          !c.juvenile
        );
        
        if (!allCrimesValid) return;

        // Проверка дата погашения
        const expungementDate = getNodeExpungementDate(nodeId);
        const isActive = !expungementDate || crime.date < expungementDate;
        
        if (!isActive) return;

        // Для ст.70+74: если это base node и условный - условность считается отменённой в операции
        if (node.type === 'base' && node.conviction.punishment.mainConditional) {
          // Условный приговор может быть подходящим, если:
          // 1) Он не в операции, но отмена условности явно указана
          // 2) Или он в операции ст.70+74 - тогда отмена автоматическая
          const consumingOpId = nodeGraph.consumedBy.get(nodeId);
          if (consumingOpId) {
            const consumingOp = mergeOps.find(op => op.id === consumingOpId);
            if (consumingOp && consumingOp.basis.includes('74')) {
              // Условность автоматически отменена в ст.70+74
              eligibleNodesForRecidivism.push({
                nodeId,
                node,
                crimes: [node.conviction.crimes[0]],
                expungementDate,
                punishment: node.conviction.punishment
              });
              return;
            }
          }
          // Иначе проверить флаг conditionalCancelledDate
          if (!node.conviction.punishment.conditionalCancelledDate) {
            return; // Не подходит
          }
        }

        // Проверка deferment
        if (node.type === 'base' && node.conviction.punishment.deferment) {
          if (!node.conviction.punishment.defermentCancelledDate) {
            return;
          }
        }

        // Все проверки пройдены - этот узел учитывается для рецидива
        const crimeForRecidivism = node.type === 'base' 
          ? node.conviction.crimes[0] 
          : crimes[0]; // первое преступление из underlying
        
        const punishment = node.type === 'base'
          ? node.conviction.punishment
          : mergeOp.mergedPunishment;
        
        eligibleNodesForRecidivism.push({
          nodeId,
          node,
          crimes: [crimeForRecidivism],
          expungementDate,
          punishment
        });
      });

      // Теперь определяем рецидив на основе eligible nodes
      const assessment = getRecidivismAssessment(crime, eligibleNodesForRecidivism.map(e => ({
        crime: e.crimes[0],
        conviction: { punishment: e.punishment }
      })));

      // Helper: Создать nodeInfo для обычного приговора
      const createNodeInfoForConviction = (conviction, convictionIdx) => {
        const nodeId = `conviction:${conviction.id}`;
        const node = getNode(nodeId);
        
        // Получить информацию об операциях этого приговора
        const parentOp = getParentOperation(conviction.id);
        const operationChain = getOperationChain(conviction.id);
        
        // Узнать, был ли результат основной операции поглощен другой операцией
        const chainInfo = operationChain ? {
          firstOp: operationChain[0],
          lastOp: operationChain[operationChain.length - 1],
          isPartOfChain: operationChain.length > 1
        } : null;
        
        // Для parent operations: найти индекс parent conviction в convictions
        const parentConvictionIdx = parentOp 
          ? convictions.findIndex(c => parentOp.parentNodeId === `conviction:${c.id}`)
          : -1;
        
        // Для consuming operation (если результат этого приговора был поглощен):
        const consumingOpId = nodeGraph.consumedBy.get(nodeId);
        const consumingOp = consumingOpId ? mergeOps.find(op => op.id === consumingOpId) : null;
        
        // Считаем дату погашения (используется effective punishment)
        const effectiveExpungementDate = getNodeExpungementDate(nodeId);
        const isActive = !effectiveExpungementDate || crime.date < effectiveExpungementDate;

        // Проверить eligibility
        let eligible = false;
        let reason = '';

        if (!isActive) {
          reason = 'Судимость погашена на дату нового преступления.';
        } else {
          const convictionEligible = isConvictionEligibleForRecidivism(
            { crime: conviction.crimes[0], conviction },
            crime.date
          );
          if (convictionEligible) {
            eligible = true;
            reason = 'Учитывается.';
          } else {
            const status = getConvictionRecidivismStatus(conviction, crime.date, []);
            reason = status.reason;
          }
        }
        
        // Получить информацию о наказании
        const punishment = getEffectivePunishment(conviction);
        const punishmentType = punishment.mainType;
        const isReal = punishment.mainReal;
        const isConditional = punishment.mainConditional;
        const autoCancelledConditional = isConditionalAutoCancelled(nodeId);
        
        // Определить тип наказания для отображения
        let punishmentLabel = '';
        if (punishmentType === 'imprisonment' || punishmentType === 'life-imprisonment') {
          if (isConditional) {
            punishmentLabel = 'лишение свободы условно';
          } else {
            punishmentLabel = 'лишение свободы';
          }
        } else if (punishmentType === 'fine') {
          punishmentLabel = 'штраф';
        } else if (punishmentType === 'restriction') {
          punishmentLabel = 'ограничение свободы';
        } else {
          punishmentLabel = 'иное наказание';
        }

        return {
          nodeId,
          node,
          conviction,
          convictionIdx,
          expungementDate: effectiveExpungementDate,
          eligible,
          isActive,
          reason,
          parentOp,
          parentConvictionIdx,
          chainInfo,
          operationChain,
          consumingOp,
          consumingOpId,
          // Новые поля для отображения
          punishment,
          punishmentLabel,
          isConditional,
          isReal,
          autoCancelledConditional,
          consumerOp: consumingOp,
          isVirtualNode: false
        };
      };

      // Helper: Создать nodeInfo для virtual node (результата операции)
      const createNodeInfoForVirtualNode = (op, mergeOpIdx) => {
        const nodeId = `merge:${op.id}`;
        const node = getNode(nodeId);
        
        // Получить информацию о родительском приговоре
        const parentConvictionId = op.parentNodeId.startsWith('conviction:') 
          ? op.parentNodeId.replace('conviction:', '')
          : null;
        const parentConvictionIdx = parentConvictionId
          ? convictions.findIndex(c => c.id === parentConvictionId)
          : -1;
        
        // Проверить, был ли этот узел поглощен другой операцией
        const consumingOpId = nodeGraph.consumedBy.get(nodeId);
        const consumingOp = consumingOpId ? mergeOps.find(op => op.id === consumingOpId) : null;
        
        // Считаем дату погашения (используется merged punishment)
        const effectiveExpungementDate = getNodeExpungementDate(nodeId);
        const isActive = !effectiveExpungementDate || crime.date < effectiveExpungementDate;

        // Проверить eligibility - для virtual node используем все underlying crimes
        let eligible = false;
        let reason = '';

        if (!isActive) {
          reason = 'Судимость погашена на дату нового преступления.';
        } else {
          // Для virtual node: собрать все underlying crimes и проверить
          const underlyingConvictions = getUnderlyingConvictions(nodeId);
          const allCrimesAreJuvenile = underlyingConvictions.every(c => c.crimes.some(crime => crime.juvenile));
          const allCrimesAreNegligent = underlyingConvictions.every(c => c.crimes.every(crime => crime.intent !== 'умышленное'));
          const allCrimesAreSmall = underlyingConvictions.every(c => c.crimes.every(crime => crime.category === 'небольшой тяжести'));
          
          if (allCrimesAreJuvenile) {
            reason = 'Не учитывается для рецидива: преступления совершены до 18 лет.';
          } else if (allCrimesAreNegligent) {
            reason = 'Не учитывается для рецидива: неумышленные преступления.';
          } else if (allCrimesAreSmall) {
            reason = 'Не учитывается для рецидива: преступления небольшой тяжести.';
          } else {
            const punishment = op.mergedPunishment;
            if (punishment.mainConditional && !punishment.conditionalCancelledDate) {
              reason = 'Не учитывается для рецидива: условное осуждение.';
            } else if (punishment.deferment && !punishment.defermentCancelledDate) {
              reason = 'Не учитывается для рецидива: отсрочка.';
            } else {
              eligible = true;
              reason = 'Учитывается.';
            }
          }
        }
        
        // Получить информацию о наказании
        const punishment = op.mergedPunishment;
        const punishmentType = punishment.mainType;
        const isReal = punishment.mainReal;
        const isConditional = punishment.mainConditional;
        
        // Определить тип наказания для отображения
        let punishmentLabel = '';
        if (punishmentType === 'imprisonment' || punishmentType === 'life-imprisonment') {
          if (isConditional) {
            punishmentLabel = 'лишение свободы условно';
          } else {
            punishmentLabel = 'лишение свободы';
          }
        } else if (punishmentType === 'fine') {
          punishmentLabel = 'штраф';
        } else if (punishmentType === 'restriction') {
          punishmentLabel = 'ограничение свободы';
        } else {
          punishmentLabel = 'иное наказание';
        }

        return {
          nodeId,
          node,
          conviction: null, // Нет обычного conviction для virtual node
          convictionIdx: -1, // Но есть родительский приговор
          parentConvictionIdx,
          expungementDate: effectiveExpungementDate,
          eligible,
          isActive,
          reason,
          parentOp: op,
          parentOpIdx: mergeOpIdx,
          consumingOp,
          consumingOpId,
          // Поля для отображения
          punishment,
          punishmentLabel,
          isConditional,
          isReal,
          autoCancelledConditional: false,
          isVirtualNode: true,
          mergeOp: op
        };
      };

      // Для справочного вывода: собрать базовые узлы (приговоры) и virtual nodes
      const perNode = [
        // Сначала обычные приговоры
        ...convictions.map((conviction, idx) => createNodeInfoForConviction(conviction, idx)),
        // Потом результаты операций (virtual nodes)
        ...getRootMergeOpIds.map((opId, idx) => {
          const op = mergeOps.find(o => o.id === opId);
          if (!op) return null;
          const mergeOpIdx = mergeOps.findIndex(o => o.id === opId);
          return createNodeInfoForVirtualNode(op, mergeOpIdx);
        }).filter(Boolean)
      ];

      return { crime, assessment, perNode };
    });
  }, [newCrimes, convictions, priorCrimes, nodeGraph, getRootNodeIds, mergeOps]);

  const updateCrime = (index, updates) => {
    setNewCrimes((prev) =>
      prev.map((crime, idx) => (idx === index ? { ...crime, ...updates } : crime))
    );
  };

  const updateConviction = (index, updates) => {
    setConvictions((prev) =>
      prev.map((conviction, idx) => (idx === index ? { ...conviction, ...updates } : conviction))
    );
  };

  // Load test scenario preset
  const loadPreset = (presetId) => {
    if (presetId === 1) {
      // Load Gorbunov's baseline scenario
      const preset = createGorbunovPreset();
      
      setBirthDate(preset.birthDate);
      setNewCrimes(preset.newCrimes);
      setConvictions(preset.convictions);
      setMergeOps(preset.mergeOps);
      setCreatingOp(preset.creatingOp);
      
      // Update URL without reload
      window.history.replaceState({}, '', '?preset=1');
    }
  };

  // Load preset from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('preset') === '1') {
      loadPreset(1);
    }
  }, []); // Empty dependency array: runs only once on mount

  return (
    <div className="min-h-screen bg-law-gradient">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-15">
          <div className="absolute -top-20 -left-10 h-80 w-80 rounded-full bg-law-200 blur-3xl" />
          <div className="absolute top-20 right-0 h-80 w-80 rounded-full bg-accent-500/60 blur-3xl" />
        </div>
        <header className="relative z-10 mx-auto flex max-w-6xl flex-col gap-8 px-6 pb-10 pt-16">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-law-200/20 px-4 py-2 text-sm text-law-100">
                <Gavel className="h-6 w-6" />
                Юридический калькулятор
              </div>
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-semibold text-white">
                  «Калькулятор рецидива»
                </h1>
                <button
                  onClick={() => loadPreset(1)}
                  className="ml-4 whitespace-nowrap rounded-xl bg-accent-500/20 px-3 py-2 text-sm text-accent-200 border border-accent-500/40 hover:bg-accent-500/30 transition-colors"
                  title="Загрузить тестовый сценарий с примером данных"
                >
                  📋 Загрузить тестовый сценарий
                </button>
              </div>
              <p className="max-w-2xl text-sm text-law-100/90">
                Заполните данные по новым преступлениям и предыдущим приговорам, чтобы
                получить анализ наличия рецидива по ст. 18 и 86 УК РФ. Интерфейс
                создан для практикующих юристов и адвокатов.
              </p>
            </div>
            <div className="flex gap-4">
              <img src={themis} alt="Фемида" className="h-24 w-24" />
              <img src={lawBook} alt="Уголовный кодекс" className="h-24 w-24" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                title: 'Шаг 1',
                description: 'Заполните сведения о новых преступлениях (даты и статьи).'
              },
              {
                title: 'Шаг 2',
                description: 'Добавьте все предыдущие приговоры и наказания.'
              },
              {
                title: 'Шаг 3',
                description: 'Посмотрите автоматический расчет рецидива.'
              }
            ].map((card) => (
              <div key={card.title} className="glass-panel rounded-2xl p-4">
                <h3 className="text-base font-semibold text-white">{card.title}</h3>
                <p className="mt-2 text-xs text-law-100/80">{card.description}</p>
              </div>
            ))}
          </div>
        </header>
      </div>

      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 pb-20">
        <SectionCard title="I. Новые преступления" icon={CalendarDays}>
          <div className="space-y-6">
            {newCrimes.map((crime, index) => (
              <div key={crime.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">
                    Преступление №{index + 1}
                  </h3>
                  {newCrimes.length > 1 && (
                    <button
                      className="flex items-center gap-2 text-xs text-red-200"
                      onClick={() =>
                        setNewCrimes((prev) => prev.filter((item) => item.id !== crime.id))
                      }
                    >
                      <Trash2 className="h-4 w-4" /> Удалить
                    </button>
                  )}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Field label="Дата совершения">
                    <input
                      type="date"
                      value={crime.date}
                      onChange={(event) => updateCrime(index, { date: event.target.value })}
                      className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Статья УК РФ">
                    <Select
                      value={crime.articleId}
                      onChange={(event) =>
                        updateCrime(index, {
                          articleId: event.target.value,
                          partId: ''
                        })
                      }
                      placeholder="Выберите статью"
                      options={getArticleOptions()}
                    />
                  </Field>
                  {crime.articleId && getPartsForArticle(crime.articleId).length > 0 && (
                    <Field label="Часть">
                      <Select
                        value={crime.partId}
                        onChange={(event) => updateCrime(index, { partId: event.target.value })}
                        placeholder="Часть (если есть)"
                        options={getPartsForArticle(crime.articleId).map((part) => ({
                          value: part,
                          label: `ч. ${part}`
                        }))}
                      />
                    </Field>
                  )}
                  {crime.articleId && crime.partId && getPointsForArticlePart(crime.articleId, crime.partId).length > 0 && (
                    <Field label="Пункт">
                      <Select
                        value={crime.pointId || ''}
                        onChange={(event) => updateCrime(index, { pointId: event.target.value })}
                        placeholder="Пункт (если есть)"
                        options={getPointsForArticlePart(crime.articleId, crime.partId).map((point) => ({
                          value: point,
                          label: point
                        }))}
                      />
                    </Field>
                  )}
                  <Field label="Категория преступления">
                    <Select
                      value={crime.category}
                      onChange={(event) => updateCrime(index, { category: event.target.value })}
                      placeholder="Категория"
                      options={crimeCategories.map((category) => ({
                        value: category,
                        label: category
                      }))}
                    />
                  </Field>
                  <Field label="Форма вины">
                    <Select
                      value={crime.intent}
                      onChange={(event) => updateCrime(index, { intent: event.target.value })}
                      placeholder="Форма вины"
                      options={intentTypes.map((intent) => ({
                        value: intent,
                        label: intent
                      }))}
                    />
                  </Field>
                </div>
              </div>
            ))}
            <button
              className="flex items-center gap-2 rounded-xl border border-law-200/50 bg-law-200/20 px-4 py-2 text-sm text-law-100"
              onClick={() => setNewCrimes((prev) => [...prev, emptyCrime()])}
            >
              <Plus className="h-4 w-4" /> Добавить дату/статью
            </button>
            <p className="text-xs text-law-100/70">
              Справочник статей охватывает ст. 105–361 УК РФ. Части и пункты
              можно расширить, заменив файл <code className="text-law-100">src/data/ukData.js</code>.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="III. Дата рождения подсудимого" icon={ClipboardList}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Дата рождения">
              <input
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
                className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
              />
            </Field>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-law-100/80">
              Дата рождения используется для проверки совершения преступлений в
              несовершеннолетнем возрасте и расчета сроков погашения судимости.
            </div>
          </div>
        </SectionCard>

        <SectionCard title="IV. Судимости по предыдущим приговорам" icon={FileText}>
          <div className="space-y-6">
            {convictions.map((conviction, index) => {
              const nodeId = `conviction:${conviction.id}`;
              const convictionNode = getNode(nodeId);
              const consumingOpId = getConsumingOpId(nodeId);
              const consumingOp = consumingOpId ? mergeOps.find(op => op.id === consumingOpId) : null;
              
              const expungementDate = getNodeExpungementDate(nodeId);

              // Check if this conviction is a parent in any merge op (non-consumed result)
              const parentOps = mergeOps.filter(op => {
                const opResultNodeId = `merge:${op.id}`;
                return !nodeGraph.consumedBy.has(opResultNodeId) && op.parentNodeId === nodeId;
              });

              return (
                <div key={conviction.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-white">Приговор №{index + 1}</h3>
                    {consumingOp && (
                      <span className="ml-3 inline-block rounded-full bg-law-200/20 px-2 py-1 text-xs text-law-100">
                        Влился в соединение (основной: {getNodeLabel(consumingOp.parentNodeId)})
                      </span>
                    )}
                    {parentOps.length > 0 && (
                      <span className="ml-3 inline-block rounded-full bg-accent-500/20 px-2 py-1 text-xs text-accent-200">
                        Основной для соединения{parentOps.length > 1 ? 'й' : ''}
                      </span>
                    )}
                    {convictions.length > 1 && (
                      <button
                        className="flex items-center gap-2 text-xs text-red-200"
                        onClick={() =>
                          setConvictions((prev) => prev.filter((item) => item.id !== conviction.id))
                        }
                      >
                        <Trash2 className="h-4 w-4" /> Удалить
                      </button>
                    )}
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <Field label="Дата приговора">
                      <input
                        type="date"
                        value={conviction.verdictDate}
                        onChange={(event) =>
                          updateConviction(index, { verdictDate: event.target.value })
                        }
                        className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="Дата вступления в силу">
                      <input
                        type="date"
                        value={conviction.legalDate}
                        onChange={(event) =>
                          updateConviction(index, { legalDate: event.target.value })
                        }
                        className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="Преступление до 03.08.2013">
                      <select
                        value={conviction.pre2013 ? 'yes' : 'no'}
                        onChange={(event) =>
                          updateConviction(index, { pre2013: event.target.value === 'yes' })
                        }
                        className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                      >
                        <option value="no">Нет</option>
                        <option value="yes">Да</option>
                      </select>
                    </Field>
                  </div>

                  <div className="mt-6 space-y-4">
                    <h4 className="text-sm font-semibold text-law-100">Преступления по приговору</h4>
                    {conviction.crimes.map((crime, crimeIndex) => (
                      <div key={crime.id} className="rounded-2xl border border-white/10 bg-white/10 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h5 className="text-sm font-semibold text-white">
                            Преступление №{crimeIndex + 1}
                          </h5>
                          {conviction.crimes.length > 1 && (
                            <button
                              className="flex items-center gap-2 text-xs text-red-200"
                              onClick={() =>
                                updateConviction(index, {
                                  crimes: conviction.crimes.filter((item) => item.id !== crime.id)
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" /> Удалить
                            </button>
                          )}
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-3">
                          <Field label="Дата совершения">
                            <input
                              type="date"
                              value={crime.date}
                              onChange={(event) => {
                                const updated = [...conviction.crimes];
                                updated[crimeIndex] = {
                                  ...crime,
                                  date: event.target.value
                                };
                                updateConviction(index, { crimes: updated });
                              }}
                              className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                            />
                          </Field>
                          <Field label="Статья УК РФ">
                            <Select
                              value={crime.articleId}
                              onChange={(event) => {
                                const updated = [...conviction.crimes];
                                updated[crimeIndex] = {
                                  ...crime,
                                  articleId: event.target.value,
                                  partId: '',
                                  pointId: ''
                                };
                                updateConviction(index, { crimes: updated });
                              }}
                              placeholder="Выберите статью"
                              options={getArticleOptions()}
                            />
                          </Field>
                          {crime.articleId && getPartsForArticle(crime.articleId).length > 0 && (
                            <Field label="Часть">
                              <Select
                                value={crime.partId}
                                onChange={(event) => {
                                  const updated = [...conviction.crimes];
                                  updated[crimeIndex] = {
                                    ...crime,
                                    partId: event.target.value,
                                    pointId: ''
                                  };
                                  updateConviction(index, { crimes: updated });
                                }}
                                placeholder="Часть (если есть)"
                                options={getPartsForArticle(crime.articleId).map((part) => ({
                                  value: part,
                                  label: `ч. ${part}`
                                }))}
                              />
                            </Field>
                          )}
                          {crime.articleId && crime.partId && getPointsForArticlePart(crime.articleId, crime.partId).length > 0 && (
                            <Field label="Пункт">
                              <Select
                                value={crime.pointId || ''}
                                onChange={(event) => {
                                  const updated = [...conviction.crimes];
                                  updated[crimeIndex] = {
                                    ...crime,
                                    pointId: event.target.value
                                  };
                                  updateConviction(index, { crimes: updated });
                                }}
                                placeholder="Пункт (если есть)"
                                options={getPointsForArticlePart(crime.articleId, crime.partId).map((point) => ({
                                  value: point,
                                  label: point
                                }))}
                              />
                            </Field>
                          )}
                          <Field label="Категория преступления">
                            <Select
                              value={crime.category}
                              onChange={(event) => {
                                const updated = [...conviction.crimes];
                                updated[crimeIndex] = {
                                  ...crime,
                                  category: event.target.value
                                };
                                updateConviction(index, { crimes: updated });
                              }}
                              placeholder="Категория"
                              options={crimeCategories.map((category) => ({
                                value: category,
                                label: category
                              }))}
                            />
                          </Field>
                          <Field label="Форма вины">
                            <Select
                              value={crime.intent}
                              onChange={(event) => {
                                const updated = [...conviction.crimes];
                                updated[crimeIndex] = {
                                  ...crime,
                                  intent: event.target.value
                                };
                                updateConviction(index, { crimes: updated });
                              }}
                              placeholder="Форма вины"
                              options={intentTypes.map((intent) => ({
                                value: intent,
                                label: intent
                              }))}
                            />
                          </Field>
                          <Field label="Совершено до 18 лет">
                            <select
                              value={crime.juvenile ? 'yes' : 'no'}
                              onChange={(event) => {
                                const updated = [...conviction.crimes];
                                updated[crimeIndex] = {
                                  ...crime,
                                  juvenile: event.target.value === 'yes'
                                };
                                updateConviction(index, { crimes: updated });
                              }}
                              className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                            >
                              <option value="no">Нет</option>
                              <option value="yes">Да</option>
                            </select>
                          </Field>
                        </div>
                      </div>
                    ))}
                    <button
                      className="flex items-center gap-2 rounded-xl border border-law-200/50 bg-law-200/20 px-4 py-2 text-sm text-law-100"
                      onClick={() =>
                        updateConviction(index, {
                          crimes: [...conviction.crimes, emptyPriorCrime()]
                        })
                      }
                    >
                      <Plus className="h-4 w-4" /> Добавить преступление
                    </button>
                  </div>

                  <div className="mt-6 space-y-4">
                    {/* Блок "Вид наказания" - ВСЕГДА редактируемый */}
                    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 space-y-4">
                      <h4 className="text-sm font-semibold text-law-100">Вид наказания</h4>
                      {consumingOp && (
                        <div className="rounded-lg bg-law-200/20 border border-law-200/40 p-3">
                          <p className="text-xs text-law-100/80">
                            ℹ️ Этот приговор влился в соединение. Вы можете менять вид наказания для расчётов, но даты отбытия регулируются операцией соединения.
                          </p>
                        </div>
                      )}
                      <Field label="Основное наказание">
                        <Select
                          value={conviction.punishment.mainType}
                          onChange={(event) =>
                            updateConviction(index, {
                              punishment: {
                                ...conviction.punishment,
                                mainType: event.target.value
                              }
                            })
                          }
                          placeholder="Вид наказания"
                          options={punishmentTypes
                            .filter((item) => item.primary)
                            .map((item) => ({
                              value: item.id,
                              label: item.label
                            }))}
                        />
                      </Field>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Реальное">
                          <select
                            value={conviction.punishment.mainReal ? 'yes' : 'no'}
                            onChange={(event) =>
                              updateConviction(index, {
                                punishment: {
                                  ...conviction.punishment,
                                  mainReal: event.target.value === 'yes'
                                }
                              })
                            }
                            className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                          >
                            <option value="yes">Да</option>
                            <option value="no">Нет</option>
                          </select>
                        </Field>
                        <Field label="Условное">
                          <select
                            value={conviction.punishment.mainConditional ? 'yes' : 'no'}
                            onChange={(event) =>
                              updateConviction(index, {
                                punishment: {
                                  ...conviction.punishment,
                                  mainConditional: event.target.value === 'yes'
                                }
                              })
                            }
                            className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                          >
                            <option value="no">Нет</option>
                            <option value="yes">Да</option>
                          </select>
                        </Field>
                      </div>
                      <Field label="Отсрочка исполнения">
                        <select
                          value={conviction.punishment.deferment ? 'yes' : 'no'}
                          onChange={(event) =>
                            updateConviction(index, {
                              punishment: {
                                ...conviction.punishment,
                                deferment: event.target.value === 'yes'
                              }
                            })
                          }
                          className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                        >
                          <option value="no">Нет</option>
                          <option value="yes">Да</option>
                        </select>
                      </Field>
                      {conviction.punishment.mainConditional && (
                        <Field label="Дата отмены условного">
                          <input
                            type="date"
                            value={conviction.punishment.conditionalCancelledDate}
                            onChange={(event) =>
                              updateConviction(index, {
                                punishment: {
                                  ...conviction.punishment,
                                  conditionalCancelledDate: event.target.value
                                }
                              })
                            }
                            className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                          />
                        </Field>
                      )}
                      {conviction.punishment.deferment && (
                        <Field label="Дата отмены отсрочки">
                          <input
                            type="date"
                            value={conviction.punishment.defermentCancelledDate}
                            onChange={(event) =>
                              updateConviction(index, {
                                punishment: {
                                  ...conviction.punishment,
                                  defermentCancelledDate: event.target.value
                                }
                              })
                            }
                            className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                          />
                        </Field>
                      )}
                      {conviction.punishment.deferment && (
                        <Field label="Дата УДО (если было)">
                          <input
                            type="date"
                            value={conviction.punishment.udoDate}
                            onChange={(event) =>
                              updateConviction(index, {
                                punishment: {
                                  ...conviction.punishment,
                                  udoDate: event.target.value
                                }
                              })
                            }
                            className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                          />
                        </Field>
                      )}
                    </div>

                    {/* Блок "Сроки исполнения" - зависит от consumingOp и basis */}
                    {consumingOp && consumingOp.basis.includes('70') ? (
                      <div className="rounded-2xl border border-white/10 bg-white/10 p-4 space-y-4">
                        <h4 className="text-sm font-semibold text-law-100">Сроки исполнения</h4>
                        <div className="rounded-lg bg-law-200/20 border border-law-200/40 p-3">
                          <p className="text-xs text-law-100/80">
                            ⚠️ Приговор вошёл в операцию ст.70/74. Даты отбытия основного и доп. наказания определяются операцией соединения (см. блок «Операции соединения приговоров»). Редактирование дат запрещено в этом приговоре.
                          </p>
                        </div>
                        <Field label="Дата УДО (по приговору)">
                          <input
                            type="date"
                            disabled
                            value={conviction.punishment.udoDate}
                            className="rounded-xl border border-law-200/40 bg-white/50 px-3 py-2 text-sm text-gray-500"
                          />
                        </Field>
                        <Field label="Дата отбытия основного наказания (по приговору)">
                          <input
                            type="date"
                            disabled
                            value={conviction.punishment.mainEndDate}
                            className="rounded-xl border border-law-200/40 bg-white/50 px-3 py-2 text-sm text-gray-500"
                          />
                        </Field>
                        {conviction.punishment.additionalType && (
                          <>
                            <Field label="Доп. наказание (по приговору)">
                              <input
                                type="text"
                                disabled
                                value={
                                  punishmentTypes.find(
                                    (pt) => pt.id === conviction.punishment.additionalType
                                  )?.label || '—'
                                }
                                className="rounded-xl border border-law-200/40 bg-white/50 px-3 py-2 text-sm text-gray-500"
                              />
                            </Field>
                            <Field label="Дата отбытия доп. наказания (по приговору)">
                              <input
                                type="date"
                                disabled
                                value={conviction.punishment.additionalEndDate}
                                className="rounded-xl border border-law-200/40 bg-white/50 px-3 py-2 text-sm text-gray-500"
                              />
                            </Field>
                          </>
                        )}
                      </div>
                    ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 space-y-4">
                      <h4 className="text-sm font-semibold text-law-100">Сроки исполнения</h4>
                      
                      {(() => {
                        const parentOp = getParentOperation(conviction.id);
                        
                        if (parentOp) {
                          // This conviction is parent in a merge operation
                          // Show dates from the operation (read-only)
                          return (
                            <div className="space-y-3">
                              <div className="rounded-lg bg-law-200/20 border border-law-200/40 p-3">
                                <p className="text-xs text-law-100/80 mb-2">
                                  ℹ️ Этот приговор — основной узел в операции соединения. Данные о наказании берутся из операции.
                                </p>
                              </div>
                              <Field label="Основное наказание (из операции)">
                                <input
                                  type="text"
                                  disabled
                                  value={
                                    punishmentTypes.find(
                                      (pt) => pt.id === parentOp.mergedPunishment.mainType
                                    )?.label || '—'
                                  }
                                  className="rounded-xl border border-law-200/40 bg-white/50 px-3 py-2 text-sm text-gray-500"
                                />
                              </Field>
                              <Field label="Дата отбытия основного наказания (из операции)">
                                <input
                                  type="date"
                                  disabled
                                  value={parentOp.mergedPunishment.mainEndDate}
                                  className="rounded-xl border border-law-200/40 bg-white/50 px-3 py-2 text-sm text-gray-500"
                                />
                              </Field>
                              <Field label="Дата УДО результата (из операции)">
                                <input
                                  type="date"
                                  disabled
                                  value={parentOp.mergedPunishment.udoDate || ''}
                                  className="rounded-xl border border-law-200/40 bg-white/50 px-3 py-2 text-sm text-gray-500"
                                />
                              </Field>
                              {parentOp.mergedPunishment.additionalType && (
                                <>
                                  <Field label="Доп. наказание (из операции)">
                                    <input
                                      type="text"
                                      disabled
                                      value={
                                        punishmentTypes.find(
                                          (pt) => pt.id === parentOp.mergedPunishment.additionalType
                                        )?.label || '—'
                                      }
                                      className="rounded-xl border border-law-200/40 bg-white/50 px-3 py-2 text-sm text-gray-500"
                                    />
                                  </Field>
                                  <Field label="Дата отбытия доп. наказания (из операции)">
                                    <input
                                      type="date"
                                      disabled
                                      value={parentOp.mergedPunishment.additionalEndDate}
                                      className="rounded-xl border border-law-200/40 bg-white/50 px-3 py-2 text-sm text-gray-500"
                                    />
                                  </Field>
                                </>
                              )}
                            </div>
                          );
                        }
                        
                        // Regular conviction (not part of any operation)
                        return (
                          <>
                            <Field label="Дата отбытия основного наказания">
                              <input
                                type="date"
                                value={conviction.punishment.mainEndDate}
                                onChange={(event) =>
                                  updateConviction(index, {
                                    punishment: {
                                      ...conviction.punishment,
                                      mainEndDate: event.target.value
                                    }
                                  })
                                }
                                className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                              />
                            </Field>
                            <Field label="Дата УДО (если было)">
                              <input
                                type="date"
                                value={conviction.punishment.udoDate}
                                onChange={(event) =>
                                  updateConviction(index, {
                                    punishment: {
                                      ...conviction.punishment,
                                      udoDate: event.target.value
                                    }
                                  })
                                }
                                className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                              />
                            </Field>
                            <Field label="Дополнительное наказание">
                              <Select
                                value={conviction.punishment.additionalType}
                                onChange={(event) =>
                                  updateConviction(index, {
                                    punishment: {
                                      ...conviction.punishment,
                                      additionalType: event.target.value
                                    }
                                  })
                                }
                                placeholder="Доп. наказание"
                                options={punishmentTypes
                                  .filter((item) => item.additional)
                                  .map((item) => ({
                                    value: item.id,
                                    label: item.label
                                  }))}
                              />
                            </Field>
                            <Field label="Дата отбытия доп. наказания">
                              <input
                                type="date"
                                value={conviction.punishment.additionalEndDate}
                                onChange={(event) =>
                                  updateConviction(index, {
                                    punishment: {
                                      ...conviction.punishment,
                                      additionalEndDate: event.target.value
                                    }
                                  })
                                }
                                className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                              />
                            </Field>
                          </>
                        );
                      })()}
                      
                      <div className="rounded-xl bg-law-200/20 p-3 text-xs text-law-100/80">
                        Дата погашения судимости: {expungementDate ? formatDate(expungementDate) : '—'}
                      </div>
                    </div>
                    )}
                  </div>
                </div>
              );
            })}
            <button
              className="flex items-center gap-2 rounded-xl border border-law-200/50 bg-law-200/20 px-4 py-2 text-sm text-law-100"
              onClick={() => setConvictions((prev) => [...prev, emptyConviction()])}
            >
              <Plus className="h-4 w-4" /> Добавить приговор
            </button>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-white">Операции соединения приговоров</h3>
              
              {/* Форма создания новой операции */}
              <div className="rounded-2xl border border-law-200/30 bg-law-200/10 p-4 space-y-4">
                <h4 className="text-sm font-semibold text-law-100">Создать новую операцию</h4>
                
                <Field label="Основание соединения">
                  <Select
                    value={creatingOp.basis}
                    onChange={(event) =>
                      setCreatingOp((prev) => ({ ...prev, basis: event.target.value }))
                    }
                    placeholder="Основание"
                    options={[
                      { value: 'ч. 5 ст. 69 УК РФ', label: 'ч. 5 ст. 69 УК РФ' },
                      { value: 'ст. 70 УК РФ', label: 'ст. 70 УК РФ' },
                      { value: 'ст. 70 и 74 УК РФ', label: 'ст. 70 и 74 УК РФ' }
                    ]}
                  />
                </Field>

                <div>
                  <div className="text-sm font-semibold text-white mb-2">Выберите узлы для соединения</div>
                  <div className="space-y-2">
                    {getAvailableNodeIds().map((nodeId) => {
                      const available = !nodeGraph.consumedBy.has(nodeId);
                      return (
                        <label key={nodeId} className="flex items-center gap-3 text-sm">
                          <input
                            type="checkbox"
                            checked={creatingOp.childNodeIds.includes(nodeId)}
                            disabled={!available}
                            onChange={() =>
                              setCreatingOp((prev) => {
                                const exists = prev.childNodeIds.includes(nodeId);
                                const next = exists
                                  ? prev.childNodeIds.filter((id) => id !== nodeId)
                                  : [...prev.childNodeIds, nodeId];
                                return { ...prev, childNodeIds: next };
                              })
                            }
                          />
                          <span className={`text-xs ${!available ? 'text-law-100/40' : 'text-law-100/90'}`}>
                            {getNodeLabel(nodeId)}
                            {!available && ` (влился в соединение)`}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {creatingOp.childNodeIds.length >= 2 && (
                  <div>
                    <Field label="Основной узел">
                      <select
                        value={creatingOp.parentNodeId}
                        onChange={(e) => setCreatingOp((prev) => ({ ...prev, parentNodeId: e.target.value }))}
                        className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Выберите основной</option>
                        {creatingOp.childNodeIds.map((nodeId) => (
                          <option key={nodeId} value={nodeId}>
                            {getNodeLabel(nodeId)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    className="flex items-center gap-2 rounded-xl border border-law-200/50 bg-law-200/20 px-4 py-2 text-sm text-law-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={createMergeOp}
                    disabled={creatingOp.childNodeIds.length < 2 || !creatingOp.parentNodeId}
                  >
                    <Plus className="h-4 w-4" /> Создать операцию
                  </button>
                  <button
                    className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-law-100/70"
                    onClick={() => setCreatingOp({
                      basis: 'ч. 5 ст. 69 УК РФ',
                      childNodeIds: [],
                      parentNodeId: ''
                    })}
                  >
                    Очистить
                  </button>
                </div>

                {creatingOp.childNodeIds.length >= 2 && !creatingOp.parentNodeId && (
                  <div className="text-xs text-red-200">
                    Требуется выбрать основной узел
                  </div>
                )}
              </div>

              {/* Список существующих операций */}
              {mergeOps.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-white">Созданные операции ({mergeOps.length})</h4>
                  {mergeOps.map((op, opIdx) => {
                    const parentNode = getNode(op.parentNodeId);
                    const childNodes = op.childNodeIds.map(id => getNode(id)).filter(Boolean);
                    const resultNodeId = `merge:${op.id}`;
                    const canDelete = canDeleteMergeOp(op.id);
                    const consumedInOp = Array.from(nodeGraph.consumedBy.entries())
                      .find(([nodeId, opId]) => nodeId === resultNodeId)?.[1];
                    
                    return (
                      <div key={op.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h5 className="text-sm font-semibold text-white">Операция №{opIdx + 1} ({op.basis})</h5>
                            <p className="text-xs text-law-100/80 mt-1">
                              Результат: {getNodeLabel(resultNodeId)}
                            </p>
                          </div>
                          <button
                            className="flex items-center gap-2 text-xs text-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => deleteMergeOp(op.id)}
                            disabled={!canDelete}
                            title={!canDelete ? 'Удалите сначала более позднее соединение' : ''}
                          >
                            <Trash2 className="h-4 w-4" /> Удалить
                          </button>
                        </div>

                        <div className="text-xs text-law-100/80 space-y-1">
                          <div>
                            <span className="font-semibold">Основной узел: </span>
                            {getNodeLabel(op.parentNodeId)}
                          </div>
                          <div>
                            <span className="font-semibold">Входящие узлы: </span>
                            {childNodes.map((n, i) => (
                              <span key={n.id}>
                                {getNodeLabel(n.id)}
                                {i < childNodes.length - 1 ? ', ' : ''}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/10 p-3 space-y-2">
                          <h6 className="text-xs font-semibold text-law-100">Параметры результата</h6>
                          <div className="grid gap-2 md:grid-cols-2">
                            <Field label="Основное наказание">
                              <Select
                                value={op.mergedPunishment.mainType}
                                onChange={(event) =>
                                  updateOpMergedPunishment(op.id, 'mainType', event.target.value)
                                }
                                placeholder="Вид наказания"
                                options={punishmentTypes
                                  .filter((item) => item.primary)
                                  .map((item) => ({ value: item.id, label: item.label }))}
                              />
                            </Field>
                            <Field label="Дата отбытия основного">
                              <input
                                type="date"
                                value={op.mergedPunishment.mainEndDate}
                                onChange={(event) =>
                                  updateOpMergedPunishment(op.id, 'mainEndDate', event.target.value)
                                }
                                className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                              />
                            </Field>
                          </div>
                          <Field label="Дата УДО результата (если применимо)">
                            <input
                              type="date"
                              value={op.mergedPunishment.udoDate || ''}
                              onChange={(event) =>
                                updateOpMergedPunishment(op.id, 'udoDate', event.target.value)
                              }
                              className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                              placeholder="Дата УДО"
                            />
                          </Field>
                          <div className="text-xs text-law-100/70 italic">
                            Если заполнена дата УДО — она используется для расчётов вместо даты отбытия основного наказания.
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            <Field label="Доп. наказание">
                              <Select
                                value={op.mergedPunishment.additionalType}
                                onChange={(event) =>
                                  updateOpMergedPunishment(op.id, 'additionalType', event.target.value)
                                }
                                placeholder="Доп. наказание"
                                options={punishmentTypes.filter((item) => item.additional).map((item) => ({ value: item.id, label: item.label }))}
                              />
                            </Field>
                            <Field label="Дата отбытия доп. наказания">
                              <input
                                type="date"
                                value={op.mergedPunishment.additionalEndDate}
                                onChange={(event) =>
                                  updateOpMergedPunishment(op.id, 'additionalEndDate', event.target.value)
                                }
                                className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                              />
                            </Field>
                          </div>
                        </div>

                        <div className="text-xs text-law-100/80">
                          {op.basis.includes('70') ? (
                            <div>ℹ️ Для ст.70/74: при определении рецидива на дату нового преступления будет учитываться результат этой операции. Даты исполнения берутся из полей результата выше.</div>
                          ) : (
                            <div>ℹ️ Для ч.5 ст.69: влившиеся узлы не учитываются отдельно для определения рецидива, учёт ведётся по основному узлу (результату операции). Даты исполнения берутся из полей результата выше.</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="V. Наличие рецидива" icon={Gavel}>
          <div className="space-y-6">
            {recidivismReport.map((entry, index) => (
              <div key={entry.crime.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                {/* Итог по новому преступлению */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/10">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Преступление №{index + 1}
                    </h3>
                    <p className="text-xs text-law-100/80">
                      Дата: {formatDate(entry.crime.date)} · Статья: {formatArticleRef(entry.crime)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-white">
                      Рецидив: {entry.assessment.hasRecidivism ? 'ДА' : 'НЕТ'}
                    </div>
                    {entry.assessment.hasRecidivism && (
                      <span className="text-xs text-law-100">
                        Вид: {entry.assessment.type}
                      </span>
                    )}
                  </div>
                </div>
                
                <p className="mt-3 text-sm text-law-100/80">{entry.assessment.reason}</p>

                {/* Анализ по узлам */}
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-white mb-4">Анализ по узлам (приговорам)</h4>
                  <div className="space-y-4">
                    {entry.perNode.map((nodeInfo) => {
                      // A) Шапка
                      let nodeLabel = '';
                      if (nodeInfo.isVirtualNode) {
                        // Virtual node: результат операции
                        const parentLabel = nodeInfo.parentOpIdx >= 0 
                          ? `результат операции №${nodeInfo.parentOpIdx + 1} (${nodeInfo.parentOp.basis})`
                          : 'результат операции';
                        nodeLabel = `Соединённый приговор: ${parentLabel}`;
                      } else {
                        // Обычный приговор
                        nodeLabel = `Приговор №${nodeInfo.convictionIdx + 1}${nodeInfo.conviction?.verdictDate ? ` от ${formatDate(nodeInfo.conviction.verdictDate)}` : ''}`;
                      }
                      
                      // B) Наказание и его дата окончания
                      const endDate = getNodeEndDateForExpungement(nodeInfo.nodeId);
                      
                      // C) Связь/операция
                      const hasConsumingOp = nodeInfo.consumingOp !== null;
                      
                      // D) Дата погашения судимости
                      const expungementDate = nodeInfo.expungementDate;
                      
                      // E) Рецидив по этому приговору
                      let recidivLine = '';
                      if (hasConsumingOp && nodeInfo.consumingOp) {
                        const pLabel = nodeInfo.consumingOp.parentNodeId.startsWith('conviction:')
                          ? getConvictionLabelByNodeId(nodeInfo.consumingOp.parentNodeId) || 'основной приговор'
                          : 'основной узел';
                        if (nodeInfo.consumingOp.basis.includes('69')) {
                          recidivLine = `Рецидив по этому узлу: не оценивается отдельно (соединён по ч.5 ст.69; учёт по основному узлу ${pLabel}).`;
                        } else if (nodeInfo.consumingOp.basis.includes('70')) {
                          recidivLine = `Рецидив по этому узлу: не оценивается отдельно (влился по ст.70/74; учёт по основному узлу ${pLabel}).`;
                        }
                      } else {
                        recidivLine = nodeInfo.eligible 
                          ? 'Рецидив по этому узлу: учитывается.'
                          : `Рецидив по этому узлу: не учитывается — ${nodeInfo.reason}`;
                      }

                      return (
                        <div key={nodeInfo.nodeId} className="rounded-lg border border-law-200/40 bg-white/8 p-4 text-sm">
                          {/* A) Шапка */}
                          <div className="font-semibold text-law-100 mb-3 text-base">{nodeLabel}</div>

                          {/* Реквизиты */}
                          {nodeInfo.isVirtualNode ? (
                            <div className="text-law-100/90 mb-3 text-xs">
                              <div><strong>Основание соединения:</strong> {nodeInfo.parentOp?.basis || '—'}</div>
                              <div><strong>Основной узел:</strong> {nodeInfo.parentConvictionIdx >= 0 ? `Приговор №${nodeInfo.parentConvictionIdx + 1}` : '—'}</div>
                            </div>
                          ) : (
                            <div className="text-law-100/90 mb-3 text-xs">
                              <div><strong>Дата приговора:</strong> {nodeInfo.conviction?.verdictDate ? formatDate(nodeInfo.conviction.verdictDate) : '—'}</div>
                              <div><strong>Дата вступления в силу:</strong> {nodeInfo.conviction?.legalDate ? formatDate(nodeInfo.conviction.legalDate) : '—'}</div>
                            </div>
                          )}

                          {/* Преступления */}
                          {!nodeInfo.isVirtualNode && (
                            <div className="mb-3 pb-3 border-b border-law-200/20">
                              <div className="text-law-100/90 mb-2"><strong>Преступления по приговору:</strong></div>
                              {nodeInfo.conviction?.crimes?.map((crime, idx) => (
                                <div key={crime.id} className="text-law-100/80 text-xs mb-1">
                                  Дата совершения: {formatDate(crime.date)} · Статья: {formatArticleRef(crime)} · Категория: {crime.category} · Вина: {crime.intent}
                                </div>
                              )) || <div className="text-law-100/80 text-xs">Не определены</div>}
                            </div>
                          )}
                          {nodeInfo.isVirtualNode && (
                            <div className="mb-3 pb-3 border-b border-law-200/20">
                              <div className="text-law-100/90 mb-2"><strong>Соединённые преступления:</strong></div>
                              {getUnderlyingCrimes(nodeInfo.nodeId).map((crime, idx) => (
                                <div key={`${nodeInfo.nodeId}-crime-${idx}`} className="text-law-100/80 text-xs mb-1">
                                  Дата: {formatDate(crime.date)} · Статья: {formatArticleRef(crime)} · Категория: {crime.category}
                                </div>
                              )) || <div className="text-law-100/80 text-xs">Не определены</div>}
                            </div>
                          )}

                          {/* Наказание (основное и доп.) */}
                          <div className="mb-3 pb-3 border-b border-law-200/20 text-law-100/90">
                            <div className="mb-2"><strong>Наказание:</strong></div>
                            <div className="text-law-100/80 text-xs mb-1">Основное: {nodeInfo.punishmentLabel}</div>
                            {nodeInfo.punishment && nodeInfo.punishment.mainType === 'imprisonment' && (
                              <div className="text-law-100/80 text-xs mb-1">Срок: {nodeInfo.punishment.mainTermYears || 0} лет {nodeInfo.punishment.mainTermMonths || 0} мес</div>
                            )}
                            {nodeInfo.isConditional && (
                              <div className="text-law-100/80 text-xs mb-1">Условное осуждение: да
                                {(!nodeInfo.autoCancelledConditional && nodeInfo.punishment && (nodeInfo.punishment.probationYears || nodeInfo.punishment.probationMonths)) && (
                                  <span>: испытательный срок {nodeInfo.punishment.probationYears || 0} лет {nodeInfo.punishment.probationMonths || 0} мес</span>
                                )}
                              </div>
                            )}
                            
                            {/* УДО информация */}
                            {nodeInfo.punishment && nodeInfo.punishment.udoDate && (
                              <div className="text-law-100/80 text-xs mb-1">УДО: дата {formatDate(nodeInfo.punishment.udoDate)}</div>
                            )}
                            
                            {/* Доп. наказание информация */}
                            {nodeInfo.punishment && nodeInfo.punishment.additionalType ? (
                              <div className="text-law-100/80 text-xs">Доп. наказание: {punishmentTypes.find(pt => pt.id === nodeInfo.punishment.additionalType)?.label || nodeInfo.punishment.additionalType} — дата отбытия: {nodeInfo.punishment.additionalEndDate ? formatDate(nodeInfo.punishment.additionalEndDate) : '—'}</div>
                            ) : (
                              <div className="text-law-100/80 text-xs">Доп. наказание: нет</div>
                            )}

                            {/* Дата отбытия наказания */}
                            <div className="text-law-100/80 text-xs mt-2">
                              <strong>Дата отбытия/окончания исполнения:</strong>{' '}
                              {endDate ? (
                                <span>{formatDate(endDate)}{nodeInfo.isVirtualNode ? <span className="text-law-100/70 ml-2">(по результату операции {nodeInfo.parentOp?.basis})</span> : (hasConsumingOp && nodeInfo.consumingOp ? <span className="text-law-100/70 ml-2">(по операции)</span> : <span className="text-law-100/70 ml-2">(по приговору)</span>)}</span>
                              ) : (
                                hasConsumingOp && nodeInfo.consumingOp && nodeInfo.consumingOp.basis.includes('69')
                                  ? <span>см. основной узел (по ч.5 ст.69)</span>
                                  : <em className="text-law-100/70">не заполнена дата окончания наказания</em>
                              )}
                            </div>

                            {nodeInfo.autoCancelledConditional && (
                              <div className="text-law-100/70 text-xs mt-1 italic">
                                ℹ️ Условное осуждение отменено (ст. 74 УК РФ); наказание присоединено к основному узлу (ст. 70 УК РФ).
                              </div>
                            )}
                            
                            {hasConsumingOp && nodeInfo.consumingOp && nodeInfo.consumingOp.basis.includes('70') && (
                              <div className="text-law-100/70 text-xs mt-1 italic">
                                ℹ️ Даты исполнения определяются результатом операции ст.70/74.
                              </div>
                            )}
                          </div>

                          {/* Дата погашения судимости */}
                          <div className="mb-3 pb-3 border-b border-law-200/20 text-law-100/90">
                            <strong>Дата погашения судимости:</strong>{' '}
                            {expungementDate 
                              ? <span className="text-law-100/80">{formatDate(expungementDate)}</span>
                              : <em className="text-law-100/70">не рассчитана (не заполнена дата окончания наказания)</em>
                            }
                          </div>

                          {/* Рецидив по этому приговору */}
                          <div className="text-law-100/80 text-xs">
                            {recidivLine}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </main>
    </div>
  );
}
