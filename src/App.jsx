import { useMemo, useState } from 'react';
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

const getConvictionRecidivismStatus = (conviction, newCrimeDate, merged) => {
  let expungementDate;
  if (merged?.enabled && merged.parentId === conviction.id) {
    expungementDate = getExpungementDate({ ...conviction, punishment: merged.mergedPunishment });
  } else {
    expungementDate = getExpungementDate(conviction);
  }
  const isActive = !expungementDate || newCrimeDate < expungementDate;

  // Если судимость погашена
  if (!isActive) {
    return {
      eligible: false,
      reason: 'Рецидив не установлен: судимость погашена на дату нового преступления.',
      expungementDate
    };
  }

  // Проверить все преступления в этом приговоре
  const { punishment } = conviction;
  
  // Проверка несовершеннолетства
  if (conviction.crimes.some((crime) => crime.juvenile)) {
    return {
      eligible: false,
      reason: 'Не учитывается для рецидива: преступление совершено до 18 лет.',
      expungementDate
    };
  }

  // Проверка формы вины
  if (conviction.crimes.some((crime) => crime.intent !== 'умышленное')) {
    return {
      eligible: false,
      reason: 'Не учитывается для рецидива: неумышленное преступление.',
      expungementDate
    };
  }

  // Проверка категории
  if (conviction.crimes.some((crime) => crime.category === 'небольшой тяжести')) {
    return {
      eligible: false,
      reason: 'Не учитывается для рецидива: преступление небольшой тяжести.',
      expungementDate
    };
  }

  // Проверка условного осуждения
  if (punishment.mainConditional && !punishment.conditionalCancelledDate) {
    return {
      eligible: false,
      reason: 'Не учитывается для рецидива: условное осуждение не отменено.',
      expungementDate
    };
  }

  // Проверка отсрочки
  if (punishment.deferment && !punishment.defermentCancelledDate) {
    return {
      eligible: false,
      reason: 'Не учитывается для рецидива: отсрочка не отменена.',
      expungementDate
    };
  }

  // Все проверки пройдены
  return {
    eligible: true,
    reason: 'Учитывается.',
    expungementDate
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
  const [merged, setMerged] = useState({
    enabled: false,
    basis: 'ч. 5 ст. 69 УК РФ',
    selectedIds: [],
    parentId: '',
    mergedPunishment: emptyPunishment()
  });

  const priorCrimes = useMemo(() => getPriorCrimes(convictions), [convictions]);

  const convictionNumberById = useMemo(() => {
    const map = new Map();
    convictions.forEach((c, idx) => map.set(c.id, idx + 1));
    return map;
  }, [convictions]);

  const recidivismReport = useMemo(() => {
    return newCrimes.map((crime) => {
      const eligible = priorCrimes.filter((entry) => {
        const cid = entry.conviction.id;
        if (merged.enabled && merged.selectedIds.includes(cid) && cid !== merged.parentId) return false;
        return isConvictionEligible(entry, crime.date);
      });
      const assessment = getRecidivismAssessment(crime, eligible);

      // Для каждого приговора в convictions сформировать статус
      const perConviction = convictions.map((conviction, idx) => {
        const status = getConvictionRecidivismStatus(conviction, crime.date, merged);
        return {
          convictionIndex: idx,
          convictionId: conviction.id,
          verdictDate: conviction.verdictDate,
          expungementDate: status.expungementDate,
          eligible: status.eligible,
          reason: status.reason
        };
      });

      return { crime, eligible, assessment, perConviction };
    });
  }, [newCrimes, priorCrimes, convictions, merged]);

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
              const isChild = merged.enabled && merged.selectedIds.includes(conviction.id) && conviction.id !== merged.parentId;
              const isParent = merged.enabled && merged.parentId === conviction.id;
              const expungementDate = isParent
                ? getExpungementDate({ ...conviction, punishment: merged.mergedPunishment })
                : getExpungementDate(conviction);

              return (
                <div key={conviction.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-white">Приговор №{index + 1}</h3>
                    {isParent && (
                      <span className="ml-3 inline-block rounded-full bg-accent-500/20 px-2 py-1 text-xs text-accent-200">Основной (соединённый)</span>
                    )}
                    {isChild && (
                      <span className="ml-3 inline-block rounded-full bg-law-200/20 px-2 py-1 text-xs text-law-100">Влившийся (соединён)</span>
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
                    {!isChild ? (
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
                          {merged.basis && merged.basis.includes('70') ? (
                            'Дата погашения по приговору не рассчитывается: наказание вошло в соединение (ст.70), отдельные даты исполнения не введены.'
                          ) : (
                            'Влившийся приговор: наказание включено в соединение и не учитывается отдельно для расчёта.'
                          )}
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

                  {merged.enabled && merged.basis && merged.basis.includes('70') && merged.parentId && (
                    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-law-100/80">
                      <div className="font-semibold">Для вводной части</div>
                      <div className="mt-1">
                        {(() => {
                          const parent = convictions.find((c) => c.id === merged.parentId);
                          const children = convictions.filter((c) => merged.selectedIds.includes(c.id) && c.id !== merged.parentId);
                          if (!parent) return null;
                          return (
                            <div>
                              Судим по приговору №{convictionNumberById.get(parent.id) ?? '—'}{parent.verdictDate ? ` от ${formatDate(parent.verdictDate)}` : ''} (основной, {merged.basis}), с ним соединён{children.length > 1 ? 'ы' : ''} {children.map((ch, i) => (
                                <span key={ch.id}>приговор №{convictionNumberById.get(ch.id) ?? '—'}{ch.verdictDate ? ` от ${formatDate(ch.verdictDate)}` : ''}{i < children.length - 1 ? ', ' : ''}</span>
                              ))} — {children.map((ch, i) => {
                                const ed = getExpungementDate(ch);
                                return (
                                  <span key={ch.id}>судимость по нему {ed && ed < entry.crime.date ? 'погашена' : 'не погашена'}{ed ? ` (погашение: ${formatDate(ed)})` : ''}{i < children.length - 1 ? '; ' : ''}</span>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
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
              <h3 className="text-sm font-semibold text-white">Соединение приговоров</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Есть соединение">
                  <select
                    value={merged.enabled ? 'yes' : 'no'}
                    onChange={(event) =>
                      setMerged((prev) => {
                        const yes = event.target.value === 'yes';
                        return yes
                          ? { ...prev }
                          : { ...prev, enabled: false, selectedIds: [], parentId: '' };
                      })
                    }
                    className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                  >
                    <option value="no">Нет</option>
                    <option value="yes">Да</option>
                  </select>
                </Field>
                <Field label="Основание соединения">
                  <Select
                    value={merged.basis}
                    onChange={(event) =>
                      setMerged((prev) => ({ ...prev, basis: event.target.value }))
                    }
                    placeholder="Основание"
                    options={[
                      { value: 'ч. 5 ст. 69 УК РФ', label: 'ч. 5 ст. 69 УК РФ' },
                      { value: 'ст. 70 УК РФ', label: 'ст. 70 УК РФ' },
                      { value: 'ст. 70 и 74 УК РФ', label: 'ст. 70 и 74 УК РФ' }
                    ]}
                  />
                </Field>
                <div />
              </div>

              {/* Выбор приговоров */}
              {merged.enabled && (
                <div className="mt-4 space-y-3">
                  <div className="text-sm font-semibold text-white">Выберите приговоры для соединения</div>
                  <div className="space-y-2">
                    {convictions.map((c, idx) => (
                      <label key={c.id} className="flex items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={merged.selectedIds.includes(c.id)}
                          onChange={() =>
                            setMerged((prev) => {
                              const exists = prev.selectedIds.includes(c.id);
                              const next = exists
                                ? prev.selectedIds.filter((id) => id !== c.id)
                                : [...prev.selectedIds, c.id];
                              const parentOk = next.includes(prev.parentId) ? prev.parentId : (next[0] || '');
                              return { ...prev, selectedIds: next, parentId: parentOk };
                            })
                          }
                        />
                        <span className="text-xs text-law-100/90">Приговор №{idx + 1}{c.verdictDate ? ` от ${formatDate(c.verdictDate)}` : ''}</span>
                      </label>
                    ))}
                  </div>

                  {merged.selectedIds.length >= 2 && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Основной приговор (после соединения)">
                        <select
                          value={merged.parentId}
                          onChange={(e) => setMerged((prev) => ({ ...prev, parentId: e.target.value }))}
                          className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                        >
                          <option value="">Выберите основной</option>
                          {convictions
                            .filter((c) => merged.selectedIds.includes(c.id))
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                Приговор №{convictionNumberById.get(c.id) ?? '—'}{c.verdictDate ? ` от ${formatDate(c.verdictDate)}` : ''}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <div className="flex items-end gap-3">
                        <button
                          className="flex items-center gap-2 rounded-xl border border-law-200/50 bg-law-200/20 px-4 py-2 text-sm text-law-100"
                          onClick={() =>
                            setMerged((prev) => {
                              const parentId = prev.parentId || prev.selectedIds[0] || '';
                              const parentConv = convictions.find((c) => c.id === parentId);
                              const mergedPun = parentConv && !prev.mergedPunishment.mainEndDate
                                ? parentConv.punishment
                                : prev.mergedPunishment;
                              return { ...prev, enabled: true, parentId, mergedPunishment: mergedPun };
                            })
                          }
                          disabled={merged.selectedIds.length < 2}
                        >
                          Сформировать соединённый приговор
                        </button>
                        <button
                          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-law-100/70"
                          onClick={() => setMerged((prev) => ({ ...prev, enabled: false }))}
                        >
                          Отменить
                        </button>
                      </div>
                    </div>
                  )}

                  {merged.enabled && (
                    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 space-y-3 mt-3">
                      <h4 className="text-sm font-semibold text-law-100">Соединённый приговор</h4>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Основное наказание">
                          <Select
                            value={merged.mergedPunishment.mainType}
                            onChange={(event) =>
                              setMerged((prev) => ({
                                ...prev,
                                mergedPunishment: {
                                  ...prev.mergedPunishment,
                                  mainType: event.target.value
                                }
                              }))
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
                            value={merged.mergedPunishment.mainEndDate}
                            onChange={(event) =>
                              setMerged((prev) => ({
                                ...prev,
                                mergedPunishment: { ...prev.mergedPunishment, mainEndDate: event.target.value }
                              }))
                            }
                            className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                          />
                        </Field>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Доп. наказание">
                          <Select
                            value={merged.mergedPunishment.additionalType}
                            onChange={(event) =>
                              setMerged((prev) => ({
                                ...prev,
                                mergedPunishment: { ...prev.mergedPunishment, additionalType: event.target.value }
                              }))
                            }
                            placeholder="Доп. наказание"
                            options={punishmentTypes.filter((item) => item.additional).map((item) => ({ value: item.id, label: item.label }))}
                          />
                        </Field>
                        <Field label="Дата отбытия доп. наказания">
                          <input
                            type="date"
                            value={merged.mergedPunishment.additionalEndDate}
                            onChange={(event) =>
                              setMerged((prev) => ({
                                ...prev,
                                mergedPunishment: { ...prev.mergedPunishment, additionalEndDate: event.target.value }
                              }))
                            }
                            className="rounded-xl border border-law-200/40 bg-white px-3 py-2 text-sm"
                          />
                        </Field>
                      </div>
                      <div className="text-xs text-law-100/80">
                        {merged.basis && merged.basis.includes('70') ? (
                          <div>По ст.70: при определении рецидива и дате погашения будет учитываться основной приговор.</div>
                        ) : (
                          <div>При соединении по совокупности (ч.5 ст.69) влившиеся приговоры не учитываются отдельно.</div>
                        )}
                      </div>
                    </div>
                  )}
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

                {/* Анализ по приговорам */}
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-white mb-4">Анализ по приговорам</h4>
                  <div className="space-y-3">
                    {entry.perConviction.map((conv) => {
                      const isParent = merged.enabled && merged.parentId === conv.convictionId;
                      const isChild = merged.enabled && merged.selectedIds.includes(conv.convictionId) && conv.convictionId !== merged.parentId;
                      return (
                        <div key={conv.convictionId} className="rounded-xl border border-white/10 bg-white/10 p-3 text-xs text-law-100/80">
                          <div className="flex items-center justify-between">
                            <div className="font-semibold text-law-100">
                              Приговор №{conv.convictionIndex + 1}
                              {conv.verdictDate ? ` от ${formatDate(conv.verdictDate)}` : ''}
                            </div>
                            <div>
                              {isParent && <span className="inline-block rounded-full bg-accent-500/20 px-2 py-1 text-xs text-accent-200">Основной</span>}
                              {isChild && <span className="inline-block rounded-full bg-law-200/20 px-2 py-1 text-xs text-law-100 ml-2">Влившийся</span>}
                            </div>
                          </div>
                          <div className="mt-1">Дата погашения судимости: {formatDate(conv.expungementDate) || '—'}</div>
                          <div className="mt-2 text-law-100/70">{conv.reason}</div>
                          <div className="mt-2 text-law-100/70">
                            {isChild ? (
                              <div>Роль: не учитывается отдельно (вошёл в соединение по {merged.basis}{merged.parentId ? ` с приговором №${convictionNumberById.get(merged.parentId)}` : ''}).</div>
                            ) : (
                              <div>Роль: {conv.eligible ? 'учитывается' : 'не учитывается'}</div>
                            )}
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
