import { useMemo, useState, useEffect } from 'react';
import {
  CalendarDays,
  ClipboardList,
  FileText,
  Gavel,
  Plus,
  Scale,
  Trash2
} from 'lucide-react';
import themis from './assets/themis.svg';
import lawBook from './assets/law-book.svg';
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
  conditionalCancelledDate: '',
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
  const actualEndDate = punishment.udoDate || punishment.mainEndDate;
  const endDate = punishment.additionalEndDate && punishment.additionalEndDate > actualEndDate
    ? punishment.additionalEndDate
    : actualEndDate;

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

const getConvictionRecidivismStatus = (conviction, newCrimeDate, mergeOps, allConvictions = []) => {
  // Найти, в какой mergeOp входит этот приговор
  const relevantOp = mergeOps?.find(op => {
    const parentConvictionId = op.parentNodeId?.replace('conviction:', '');
    const childConvictionIds = op.childNodeIds
      .filter(id => id.startsWith('conviction:'))
      .map(id => id.replace('conviction:', ''));
    return parentConvictionId === conviction.id || childConvictionIds.includes(conviction.id);
  });

  let expungementDate;
  let isChildInOperation = false;
  let operationBasis = '';
  
  if (relevantOp) {
    const parentConvictionId = relevantOp.parentNodeId?.replace('conviction:', '');
    const isParent = parentConvictionId === conviction.id;
    isChildInOperation = !isParent;
    operationBasis = relevantOp.basis;
    
    if (isParent) {
      // Это основной приговор - использовать соединённое наказание
      expungementDate = getExpungementDate({ ...conviction, punishment: relevantOp.mergedPunishment });
    } else {
      // Это "влившийся" приговор
      if (operationBasis.includes('69')) {
        // ч.5 ст.69: для рецидива не учитывается отдельно, нужно считать по основному узлу
        expungementDate = getExpungementDate(conviction);
      } else {
        // ст.70 или ст.70+74: дата отбытия от основного узла, но период погашения по этому приговору
        const parentConviction = allConvictions.find(c => c.id === parentConvictionId);
        if (parentConviction) {
          const mergedPaymentDate = relevantOp.mergedPunishment.mainEndDate || relevantOp.mergedPunishment.udoDate;
          // Рассчитать погашение для "влившегося" от даты отбытия основного
          const modifiedConviction = { ...conviction };
          if (mergedPaymentDate) {
            modifiedConviction.punishment = { ...conviction.punishment, mainEndDate: mergedPaymentDate };
          }
          expungementDate = getExpungementDate(modifiedConviction);
        } else {
          expungementDate = getExpungementDate(conviction);
        }
      }
    }
  } else {
    // Обычный приговор без операций
    expungementDate = getExpungementDate(conviction);
  }

  const isActive = !expungementDate || newCrimeDate < expungementDate;

  // Если судимость погашена
  if (!isActive) {
    return {
      eligible: false,
      reason: `Рецидив не установлен: судимость погашена на дату нового преступления (${formatDate(expungementDate)}).`,
      expungementDate,
      isChildInOperation,
      operationBasis
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
      isChildInOperation,
      operationBasis
    };
  }

  // Проверка формы вины
  if (conviction.crimes.some((crime) => crime.intent !== 'умышленное')) {
    return {
      eligible: false,
      reason: 'Не учитывается для рецидива: неумышленное преступление.',
      expungementDate,
      isChildInOperation,
      operationBasis
    };
  }

  // Проверка категории
  if (conviction.crimes.some((crime) => crime.category === 'небольшой тяжести')) {
    return {
      eligible: false,
      reason: 'Не учитывается для рецидива: преступление небольшой тяжести.',
      expungementDate,
      isChildInOperation,
      operationBasis
    };
  }

  // Проверка условного осуждения (но для ст.70+74 условность считается отменённой)
  if (punishment.mainConditional && !punishment.conditionalCancelledDate) {
    const isConditionalCancelledByOperation = isChildInOperation && operationBasis.includes('70') && operationBasis.includes('74');
    if (!isConditionalCancelledByOperation) {
      return {
        eligible: false,
        reason: 'Не учитывается для рецидива: условное осуждение не отменено.',
        expungementDate,
        isChildInOperation,
        operationBasis
      };
    }
  }

  // Проверка отсрочки
  if (punishment.deferment && !punishment.defermentCancelledDate) {
    return {
      eligible: false,
      reason: 'Не учитывается для рецидива: отсрочка не отменена.',
      expungementDate,
      isChildInOperation,
      operationBasis
    };
  }

  // Все проверки пройдены
  return {
    eligible: true,
    reason: 'Учитывается.',
    expungementDate,
    isChildInOperation,
    operationBasis
  };
};

const getRecidivismAssessment = (newCrime, eligibleCrimes) => {
  // Построить basis из всех уникальных приговоров в eligibleCrimes
  const getUniqueBasis = (list) => {
    const uniqueByConviction = new Map();
    list.forEach((entry) => {
      const convictionId = entry.conviction.id;
      if (!uniqueByConviction.has(convictionId)) {
        uniqueByConviction.set(convictionId, entry);
      }
    });
    return Array.from(uniqueByConviction.values());
  };

  if (newCrime.intent !== 'умышленное') {
    return {
      type: 'Нет рецидива',
      reason: 'Новое преступление совершено по неосторожности (ч. 1 ст. 18 УК РФ).',
      hasRecidivism: false
    };
  }

  if (eligibleCrimes.length === 0) {
    return {
      type: 'Нет рецидива',
      reason: 'Нет действующих судимостей за умышленные преступления средней/тяжкой категории.',
      hasRecidivism: false
    };
  }

  const severePrior = eligibleCrimes.filter(
    ({ crime }) => crime.category === 'тяжкое' || crime.category === 'особо тяжкое'
  );
  const mediumPrior = eligibleCrimes.filter(
    ({ crime }) => crime.category === 'средней тяжести'
  );
  const realImprisonmentPrior = eligibleCrimes.filter(
    ({ conviction }) => conviction.punishment.mainType === 'imprisonment' && conviction.punishment.mainReal
  );
  const severeImprisonmentPrior = realImprisonmentPrior.filter(
    ({ crime }) => crime.category === 'тяжкое' || crime.category === 'особо тяжкое'
  );
  const heavyImprisonmentPrior = realImprisonmentPrior.filter(
    ({ crime }) => crime.category === 'тяжкое'
  );

  if (newCrime.category === 'тяжкое' && heavyImprisonmentPrior.length >= 2) {
    return {
      type: 'Особо опасный рецидив',
      reason: 'Два и более тяжких умышленных преступления с реальным лишением свободы (ч. 3 ст. 18 УК РФ).',
      hasRecidivism: true
    };
  }

  if (newCrime.category === 'особо тяжкое' && (heavyImprisonmentPrior.length >= 2 || severeImprisonmentPrior.length >= 1)) {
    return {
      type: 'Особо опасный рецидив',
      reason: 'Особо тяжкое новое преступление и тяжкие/особо тяжкие судимости (ч. 3 ст. 18 УК РФ).',
      hasRecidivism: true
    };
  }

  if (newCrime.category === 'тяжкое' && mediumPrior.length >= 2 && realImprisonmentPrior.length >= 2) {
    return {
      type: 'Опасный рецидив',
      reason: 'Два и более умышленных преступления средней тяжести с лишением свободы (ч. 2 ст. 18 УК РФ).',
      hasRecidivism: true
    };
  }

  if (newCrime.category === 'тяжкое' && severePrior.length >= 1) {
    return {
      type: 'Опасный рецидив',
      reason: 'Новое тяжкое преступление при наличии тяжкой/особо тяжкой судимости (ч. 2 ст. 18 УК РФ).',
      hasRecidivism: true
    };
  }

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
      const parentVerdictDate = parentNode?.verdictDate || '';

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
      const dateStr = node.verdictDate ? ` от ${formatDate(node.verdictDate)}` : '';
      return `Приговор №${idx + 1}${dateStr}`;
    }
    
    if (node.type === 'virtual') {
      const parentLabel = getNodeLabel(node.parentNodeId);
      const basis = node.mergeOp.basis;
      return `Соединённый (${basis}) — основной: ${parentLabel}`;
    }
  };

  // Create merge operation
  const createMergeOp = () => {
    if (creatingOp.childNodeIds.length < 2 || !creatingOp.parentNodeId) return;
    
    const newOp = {
      id: crypto.randomUUID(),
      basis: creatingOp.basis,
      childNodeIds: creatingOp.childNodeIds,
      parentNodeId: creatingOp.parentNodeId,
      mergedPunishment: emptyPunishment(),
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
      return getExpungementDate(node.conviction);
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
      // Для рецидива учитываем только root nodes (не consumed)
      // Это могут быть base convictions или virtual merge result nodes
      const rootNodeIds = getRootNodeIds;
      
      // Helper для проверки eligibility узла для рецидива
      const isNodeEligibleForRecidivum = (nodeId, newCrimeDate) => {
        const node = getNode(nodeId);
        if (!node) return false;

        if (node.type === 'base') {
          // Базовый приговор
          const conviction = node.conviction;
          const expungementDate = getExpungementDate(conviction);
          const isActive = !expungementDate || newCrimeDate < expungementDate;
          
          if (!isActive) return false;
          
          return conviction.crimes.every((c) => {
            return c.intent === 'умышленное' && 
                   c.category !== 'небольшой тяжести' && 
                   !c.juvenile &&
                   (!conviction.punishment.mainConditional || conviction.punishment.conditionalCancelledDate) &&
                   (!conviction.punishment.deferment || conviction.punishment.defermentCancelledDate);
          });
        }

        if (node.type === 'virtual') {
          // Virtual узел - результат merge
          const mergeOp = node.mergeOp;
          const expungementDate = getNodeExpungementDate(nodeId);
          const isActive = !expungementDate || newCrimeDate < expungementDate;
          
          if (!isActive) return false;

          const underlyingConvictions = getUnderlyingConvictions(nodeId);
          return underlyingConvictions.every((conv) => {
            return conv.crimes.every((c) => {
              return c.intent === 'умышленное' && 
                     c.category !== 'небольшой тяжести' && 
                     !c.juvenile;
            }) && (
              !mergeOp.mergedPunishment.mainConditional || mergeOp.mergedPunishment.mainConditional === false
            ) && (
              !mergeOp.mergedPunishment.deferment || mergeOp.mergedPunishment.defermentCancelledDate
            );
          });
        }

        return false;
      };

      // Собрать все eligible crimes из root nodes для этого нового преступления
      const eligibleRootCrimes = [];
      
      rootNodeIds.forEach((nodeId) => {
        const node = getNode(nodeId);
        if (!node) return;
        
        if (node.type === 'base') {
          // Базовый приговор - проверить его eligibility
          if (isNodeEligibleForRecidivum(nodeId, crime.date)) {
            node.conviction.crimes.forEach((c) => {
              const entry = { crime: c, conviction: node.conviction };
              eligibleRootCrimes.push(entry);
            });
          }
        } else if (node.type === 'virtual') {
          // Виртуальный узел (результат соединения)
          if (isNodeEligibleForRecidivum(nodeId, crime.date)) {
            const underlyingConvictions = getUnderlyingConvictions(nodeId);
            underlyingConvictions.forEach((conv) => {
              conv.crimes.forEach((c) => {
                const entry = { crime: c, conviction: conv };
                eligibleRootCrimes.push(entry);
              });
            });
          }
        }
      });

      // Убрать дубликаты (по conviction.id)
      const uniqueEligibleCrimes = Array.from(
        new Map(eligibleRootCrimes.map(e => [e.conviction.id, e])).values()
      );

      const assessment = getRecidivismAssessment(crime, uniqueEligibleCrimes);

      // Для справочного вывода: собрать информацию по всем узлам (base + virtual)
      const perNode = Array.from(nodeGraph.nodesById.keys()).map((nodeId) => {
        const node = getNode(nodeId);
        const expungementDate = getNodeExpungementDate(nodeId);
        const isActive = !expungementDate || crime.date < expungementDate;
        const isConsumed = nodeGraph.consumedBy.has(nodeId);
        const isRoot = !isConsumed;

        // Информация о соединении, если это consumed узел
        let consumingOpInfo = null;
        if (isConsumed) {
          const consumingOpId = nodeGraph.consumedBy.get(nodeId);
          const consumingOp = mergeOps.find(op => op.id === consumingOpId);
          if (consumingOp) {
            consumingOpInfo = {
              basis: consumingOp.basis,
              parentNodeId: consumingOp.parentNodeId
            };
          }
        }

        // Определить, учитывается ли этот узел для рецидива
        let recidivumText = '';
        let isEligibleForRecidivum = false;
        
        if (!isRoot) {
          // Consumed узел - зависит от типа операции
          if (consumingOpInfo.basis.includes('69')) {
            recidivumText = 'Не учитывается отдельно (соединён по ч.5 ст.69)';
          } else if (consumingOpInfo.basis.includes('70')) {
            recidivumText = 'Влился в основной узел (ст.70), для рецидива смотреть основной узел';
            isEligibleForRecidivum = false;
          }
        } else {
          // Root узел
          if (node.type === 'base') {
            const convictionEligible = isNodeEligibleForRecidivum(nodeId, crime.date);
            isEligibleForRecidivum = convictionEligible;
            
            if (!isActive) {
              recidivumText = `Судимость погашена: ${formatDate(expungementDate)}`;
            } else if (convictionEligible) {
              recidivumText = 'Учитывается для определения рецидива';
            } else {
              const status = getConvictionRecidivismStatus(node.conviction, crime.date, mergeOps, convictions);
              recidivumText = status.reason;
            }
          } else if (node.type === 'virtual') {
            // Virtual root node - это результат merge, учитывается как целое
            const allEligible = isNodeEligibleForRecidivum(nodeId, crime.date);
            isEligibleForRecidivum = allEligible;
            
            if (!isActive) {
              recidivumText = `Судимость по узлу погашена: ${formatDate(expungementDate)}`;
            } else if (allEligible) {
              recidivumText = 'Учитывается для определения рецидива (результат соединения)';
            } else {
              recidivumText = 'Не учитывается (содержит неподходящие преступления или наказания)';
            }
          }
        }

        return {
          nodeId,
          node,
          expungementDate,
          isActive,
          isRoot,
          isConsumed,
          consumingOpInfo,
          recidivumText,
          isEligibleForRecidivum
        };
      });

      return { crime, assessment, perNode };
    });
  }, [newCrimes, convictions, mergeOps, nodeGraph, getRootNodeIds]);

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

  // Загрузить тестовый сценарий
  const loadTestScenario = () => {
    setBirthDate('1970-01-01');

    // Новые преступления
    setNewCrimes([
      {
        id: crypto.randomUUID(),
        date: '2026-01-01',
        articleId: '228.1',
        partId: '3',
        pointId: 'б',
        category: 'особо тяжкое',
        intent: 'умышленное'
      },
      {
        id: crypto.randomUUID(),
        date: '2026-02-01',
        articleId: '158',
        partId: '1',
        pointId: '',
        category: 'небольшой тяжести',
        intent: 'умышленное'
      },
      {
        id: crypto.randomUUID(),
        date: '2026-03-01',
        articleId: '293',
        partId: '2',
        pointId: '',
        category: 'средней тяжести',
        intent: 'неосторожное'
      },
      {
        id: crypto.randomUUID(),
        date: '2026-04-01',
        articleId: '159',
        partId: '3',
        pointId: '',
        category: 'тяжкое',
        intent: 'умышленное'
      }
    ]);

    // Приговоры и операции соединения
    const conv1Id = crypto.randomUUID();
    const conv2Id = crypto.randomUUID();
    const conv3Id = crypto.randomUUID();
    const conv4Id = crypto.randomUUID();
    const conv5Id = crypto.randomUUID();

    setConvictions([
      {
        id: conv1Id,
        verdictDate: '2015-01-01',
        legalDate: '2015-02-01',
        pre2013: false,
        crimes: [{
          id: crypto.randomUUID(),
          date: '2014-01-01',
          articleId: '159',
          partId: '3',
          pointId: '',
          category: 'тяжкое',
          intent: 'умышленное',
          juvenile: false
        }],
        punishment: {
          mainType: 'imprisonment',
          mainReal: false,
          mainConditional: true,
          conditionalCancelledDate: '',
          deferment: false,
          defermentCancelledDate: '',
          udoDate: '',
          mainEndDate: '2018-01-01',
          additionalType: '',
          additionalEndDate: ''
        }
      },
      {
        id: conv2Id,
        verdictDate: '2015-04-01',
        legalDate: '2015-05-01',
        pre2013: false,
        crimes: [{
          id: crypto.randomUUID(),
          date: '2015-03-01',
          articleId: '162',
          partId: '2',
          pointId: '',
          category: 'особо тяжкое',
          intent: 'умышленное',
          juvenile: false
        }],
        punishment: {
          mainType: 'imprisonment',
          mainReal: true,
          mainConditional: false,
          conditionalCancelledDate: '',
          deferment: false,
          defermentCancelledDate: '',
          udoDate: '',
          mainEndDate: '2018-06-01',
          additionalType: '',
          additionalEndDate: ''
        }
      },
      {
        id: conv3Id,
        verdictDate: '2019-01-01',
        legalDate: '2019-02-01',
        pre2013: false,
        crimes: [{
          id: crypto.randomUUID(),
          date: '2018-12-01',
          articleId: '105',
          partId: '1',
          pointId: '',
          category: 'особо тяжкое',
          intent: 'умышленное',
          juvenile: false
        }],
        punishment: {
          mainType: 'imprisonment',
          mainReal: true,
          mainConditional: false,
          conditionalCancelledDate: '',
          deferment: false,
          defermentCancelledDate: '',
          udoDate: '',
          mainEndDate: '2021-01-01',
          additionalType: '',
          additionalEndDate: ''
        }
      },
      {
        id: conv4Id,
        verdictDate: '2019-03-01',
        legalDate: '2019-04-01',
        pre2013: false,
        crimes: [{
          id: crypto.randomUUID(),
          date: '2019-02-01',
          articleId: '105',
          partId: '1',
          pointId: '',
          category: 'особо тяжкое',
          intent: 'умышленное',
          juvenile: false
        }],
        punishment: {
          mainType: 'imprisonment',
          mainReal: true,
          mainConditional: false,
          conditionalCancelledDate: '',
          deferment: false,
          defermentCancelledDate: '',
          udoDate: '',
          mainEndDate: '2022-01-01',
          additionalType: '',
          additionalEndDate: ''
        }
      },
      {
        id: conv5Id,
        verdictDate: '2025-01-01',
        legalDate: '2025-02-01',
        pre2013: false,
        crimes: [{
          id: crypto.randomUUID(),
          date: '2024-12-01',
          articleId: '105',
          partId: '1',
          pointId: '',
          category: 'особо тяжкое',
          intent: 'умышленное',
          juvenile: false
        }],
        punishment: {
          mainType: 'imprisonment',
          mainReal: true,
          mainConditional: false,
          conditionalCancelledDate: '',
          deferment: false,
          defermentCancelledDate: '',
          udoDate: '',
          mainEndDate: '2026-12-01',
          additionalType: '',
          additionalEndDate: ''
        }
      }
    ]);

    // Операции соединения
    const op1Id = crypto.randomUUID();
    const op2Id = crypto.randomUUID();
    const op3Id = crypto.randomUUID();

    setMergeOps([
      {
        id: op1Id,
        basis: 'ст. 70 и 74 УК РФ',
        childNodeIds: [`conviction:${conv1Id}`],
        parentNodeId: `conviction:${conv2Id}`,
        mergedPunishment: {
          mainType: 'imprisonment',
          mainReal: true,
          mainConditional: false,
          conditionalCancelledDate: '',
          deferment: false,
          defermentCancelledDate: '',
          udoDate: '',
          mainEndDate: '2018-12-01',
          additionalType: '',
          additionalEndDate: ''
        },
        createdAt: new Date().toISOString()
      },
      {
        id: op2Id,
        basis: 'ч. 5 ст. 69 УК РФ',
        childNodeIds: [`conviction:${conv3Id}`],
        parentNodeId: `conviction:${conv4Id}`,
        mergedPunishment: {
          mainType: 'imprisonment',
          mainReal: true,
          mainConditional: false,
          conditionalCancelledDate: '',
          deferment: false,
          defermentCancelledDate: '',
          udoDate: '',
          mainEndDate: '2024-01-01',
          additionalType: '',
          additionalEndDate: ''
        },
        createdAt: new Date().toISOString()
      },
      {
        id: op3Id,
        basis: 'ч. 5 ст. 69 УК РФ',
        childNodeIds: [`merge:${op2Id}`],
        parentNodeId: `conviction:${conv5Id}`,
        mergedPunishment: {
          mainType: 'imprisonment',
          mainReal: true,
          mainConditional: false,
          conditionalCancelledDate: '',
          deferment: false,
          defermentCancelledDate: '',
          udoDate: '',
          mainEndDate: '2025-12-01',
          additionalType: '',
          additionalEndDate: ''
        },
        createdAt: new Date().toISOString()
      }
    ]);
  };

  // Проверить наличие параметра preset
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('preset') === '1') {
      loadTestScenario();
    }
  }, []);

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
                <Scale className="h-4 w-4" />
                Юридический калькулятор
              </div>
              <h1 className="text-4xl font-semibold text-white">
                «Калькулятор рецидива»
              </h1>
              <p className="max-w-2xl text-sm text-law-100/90">
                Заполните данные по новым преступлениям и предыдущим приговорам, чтобы
                получить анализ наличия рецидива по ст. 18 и 86 УК РФ. Интерфейс
                создан для практикующих юристов и адвокатов.
              </p>
              <button
                onClick={loadTestScenario}
                className="mt-2 inline-flex items-center gap-2 rounded-xl bg-accent-500/20 px-3 py-1.5 text-xs text-accent-200 border border-accent-500/40 hover:bg-accent-500/30 transition-colors"
              >
                📋 Загрузить тестовый сценарий
              </button>
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

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {!consumingOp ? (
                      <div className="rounded-2xl border border-white/10 bg-white/10 p-4 space-y-4">
                      <h4 className="text-sm font-semibold text-law-100">Вид наказания</h4>
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
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-white/10 p-4 space-y-4">
                        <div className="text-xs text-law-100/80">
                          Приговор влился в соединение. Наказание регулируется заданием параметров соединения, отдельные сроки здесь не редактируются.
                        </div>
                      </div>
                    )}

                    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 space-y-4">
                      <h4 className="text-sm font-semibold text-law-100">Сроки исполнения</h4>
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
                      <div className="rounded-xl bg-law-200/20 p-3 text-xs text-law-100/80">
                        Дата погашения судимости: {expungementDate ? formatDate(expungementDate) : '—'}
                      </div>
                    </div>
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
                            <Field label="Дата отбытия">
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
                            <Field label="Дата отбытия">
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
                            <div>По ст.70: при определении рецидива на дату нового преступления будет учитываться результат этой операции.</div>
                          ) : (
                            <div>По ч.5 ст.69: влившиеся узлы не учитываются отдельно для определения рецидива.</div>
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
                      <span className="text-xs text-accent-200">
                        Вид: {entry.assessment.type}
                      </span>
                    )}
                  </div>
                </div>
                
                <p className="mt-3 text-sm text-law-100/80">{entry.assessment.reason}</p>

                {/* Анализ по узлам */}
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-white mb-4">Анализ по узлам (приговорам и их соединениям)</h4>
                  <div className="space-y-2">
                    {entry.perNode.map((nodeInfo) => {
                      const isRoot = !nodeInfo.isConsumed;
                      const baseConviction = nodeInfo.node.type === 'base' ? nodeInfo.node.conviction : null;
                      const nodeNumber = baseConviction ? convictionNumberById.get(baseConviction.id) : null;
                      
                      return (
                        <div key={nodeInfo.nodeId} className={`rounded-lg border ${isRoot ? 'border-white/20' : 'border-white/10'} ${isRoot ? 'bg-white/10' : 'bg-white/5'} p-3 text-xs space-y-1`}>
                          {/* Название узла */}
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-law-100">
                              {getNodeLabel(nodeInfo.nodeId)}
                            </span>
                            {!isRoot && (
                              <span className="inline-block rounded-full bg-law-200/20 px-2 py-0.5 text-xs text-law-100">
                                соединён
                              </span>
                            )}
                          </div>

                          {/* Дата погашения судимости */}
                          <div className="text-law-100/80">
                            {nodeInfo.expungementDate ? (
                              <span>Дата погашения: {formatDate(nodeInfo.expungementDate)}</span>
                            ) : isRoot ? (
                              <span className="text-red-300">Дата погашения: не вычислена (требуется заполнить дату отбытия)</span>
                            ) : (
                              <span className="text-law-100/70">Дата погашения: см. основной узел</span>
                            )}
                          </div>

                          {/* Информация о рецидиве по этому узлу */}
                          <div className="text-law-100/70">
                            {nodeInfo.recidivumText}
                          </div>

                          {/* Информация о соединении и условности */}
                          {nodeInfo.isConsumed && nodeInfo.consumingOpInfo && (
                            <div className="text-law-100/70 italic">
                              {nodeInfo.consumingOpInfo.basis.includes('70') && nodeInfo.consumingOpInfo.basis.includes('74') && baseConviction && baseConviction.punishment.mainConditional ? (
                                <div>условность отменена (ст.74)</div>
                              ) : null}
                            </div>
                          )}
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
