/**
 * Горбунов базовый сценарий (preset=1)
 * Полный набор данных для тестирования калькулятора рецидива
 * 
 * СЦЕНАРИЙ:
 * Дата рождения: 01.01.1970
 * 
 * Новые преступления:
 * №1) 01.01.2026 — п.«б» ч.3 ст.228.1 (особо тяжкое, умышленное)
 * №2) 01.02.2026 — ч.1 ст.158 (небольшой тяжести, умышленное)
 * №3) 01.03.2026 — ч.2 ст.293 (средней тяжести, НЕОСТОРОЖНОЕ)
 * №4) 01.04.2026 — ч.3 ст.159 (тяжкое, умышленное)
 * 
 * Приговоры:
 * №1: 01.01.2015 (в силе 01.02.2015) — ч.3 ст.159 тяжкое умышленное, УСЛОВНОЕ
 * №2: 01.04.2015 (в силе 01.05.2015) — ч.2 ст.162 особо тяжкое умышленное, отбыто 01.12.2018
 * Операция A: ст.70 и 74 — основной: №2, влился: №1, отмена условного, дата отбытия по основному: 01.12.2018
 * 
 * №3: 01.01.2019 (в силе 01.02.2019) — ч.1 ст.105 особо тяжкое умышленное, отбыто 01.01.2024
 * №4: 01.03.2019 (в силе 01.04.2019) — ч.1 ст.105 особо тяжкое умышленное, отбыто 01.01.2024
 * Операция B: ч.5 ст.69 — основной: №4, влился: №3, дата отбытия по основному узлу: 01.01.2024
 * 
 * №5: 01.01.2025 (в силе 01.02.2025) — ч.1 ст.105 особо тяжкое умышленное, отбыто 01.12.2025
 * Операция C: ч.5 ст.69 — основной: №5, влился: (узел №4 как уже соединённый), дата отбытия по основному узлу: 01.12.2025
 * 
 * ОЖИДАНИЯ:
 * - По новому преступлению №3 (неосторожное) — рецидива нет
 * - По преступлению №1 (особо тяжкое умышленное) — рецидив: особо опасный
 * - По №2 и №4 также рецидив должен корректно определяться исходя из активных судимостей на даты 01.02.2026 и 01.04.2026
 */

export function createGorbunovPreset() {
  // Stable IDs for reproducibility
  const convIds = {
    '1': 'conv-gorbunov-1',
    '2': 'conv-gorbunov-2',
    '3': 'conv-gorbunov-3',
    '4': 'conv-gorbunov-4',
    '5': 'conv-gorbunov-5'
  };

  const crimeIds = {
    new1: 'crime-new-1',
    new2: 'crime-new-2',
    new3: 'crime-new-3',
    new4: 'crime-new-4',
    c1_1: 'crime-conv1-1',
    c2_1: 'crime-conv2-1',
    c3_1: 'crime-conv3-1',
    c4_1: 'crime-conv4-1',
    c5_1: 'crime-conv5-1'
  };

  const opIds = {
    A: 'op-gorbunov-A',
    B: 'op-gorbunov-B',
    C: 'op-gorbunov-C'
  };

  return {
    birthDate: '1970-01-01',

    // New crimes
    newCrimes: [
      {
        id: crimeIds.new1,
        date: '2026-01-01',
        articleId: '228.1',
        partId: '3',
        pointId: 'б',
        category: 'особо тяжкое',
        intent: 'умышленное'
      },
      {
        id: crimeIds.new2,
        date: '2026-02-01',
        articleId: '158',
        partId: '1',
        pointId: '',
        category: 'небольшой тяжести',
        intent: 'умышленное'
      },
      {
        id: crimeIds.new3,
        date: '2026-03-01',
        articleId: '293',
        partId: '2',
        pointId: '',
        category: 'средней тяжести',
        intent: 'неосторожное'
      },
      {
        id: crimeIds.new4,
        date: '2026-04-01',
        articleId: '159',
        partId: '3',
        pointId: '',
        category: 'тяжкое',
        intent: 'умышленное'
      }
    ],

    // Prior convictions
    convictions: [
      // Приговор №1: условное по ст.159 (тяжкое)
      {
        id: convIds['1'],
        verdictDate: '2015-01-01',
        legalDate: '2015-02-01',
        pre2013: false,
        crimes: [
          {
            id: crimeIds.c1_1,
            date: '2015-01-01',
            articleId: '159',
            partId: '3',
            pointId: '',
            category: 'тяжкое',
            intent: 'умышленное',
            juvenile: false
          }
        ],
        punishment: {
          mainType: 'imprisonment',
          mainReal: false,
          mainConditional: true,
          mainTermYears: 3,
          mainTermMonths: 0,
          conditionalCancelledDate: '',
          probationYears: 3,
          probationMonths: 0,
          deferment: false,
          defermentCancelledDate: '',
          udoDate: '',
          mainEndDate: '2018-01-01',
          additionalType: '',
          additionalEndDate: ''
        }
      },
      // Приговор №2: реальное по ст.162 (особо тяжкое), отбыто 01.12.2018
      {
        id: convIds['2'],
        verdictDate: '2015-04-01',
        legalDate: '2015-05-01',
        pre2013: false,
        crimes: [
          {
            id: crimeIds.c2_1,
            date: '2015-04-01',
            articleId: '162',
            partId: '2',
            pointId: '',
            category: 'особо тяжкое',
            intent: 'умышленное',
            juvenile: false
          }
        ],
        punishment: {
          mainType: 'imprisonment',
          mainReal: true,
          mainConditional: false,
          mainTermYears: 8,
          mainTermMonths: 0,
          mainTermYears: 10,
          mainTermMonths: 0,
          mainTermYears: 10,
          mainTermMonths: 0,
          conditionalCancelledDate: '',
          probationYears: 0,
          probationMonths: 0,
          probationYears: 0,
          probationMonths: 0,
          probationYears: 0,
          probationMonths: 0,
          deferment: false,
          defermentCancelledDate: '',
          udoDate: '',
          mainEndDate: '2018-12-01',
          additionalType: '',
          additionalEndDate: ''
        }
      },
      // Приговор №3: реальное по ст.105 (особо тяжкое), отбыто 01.01.2024
      {
        id: convIds['3'],
        verdictDate: '2019-01-01',
        legalDate: '2019-02-01',
        pre2013: false,
        crimes: [
          {
            id: crimeIds.c3_1,
            date: '2019-01-01',
            articleId: '105',
            partId: '1',
            pointId: '',
            category: 'особо тяжкое',
            intent: 'умышленное',
            juvenile: false
          }
        ],
        punishment: {
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
        }
      },
      // Приговор №4: реальное по ст.105 (особо тяжкое), отбыто 01.01.2024
      {
        id: convIds['4'],
        verdictDate: '2019-03-01',
        legalDate: '2019-04-01',
        pre2013: false,
        crimes: [
          {
            id: crimeIds.c4_1,
            date: '2019-03-01',
            articleId: '105',
            partId: '1',
            pointId: '',
            category: 'особо тяжкое',
            intent: 'умышленное',
            juvenile: false
          }
        ],
        punishment: {
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
        }
      },
      // Приговор №5: реальное по ст.105 (особо тяжкое), отбыто 01.12.2025
      {
        id: convIds['5'],
        verdictDate: '2025-01-01',
        legalDate: '2025-02-01',
        pre2013: false,
        crimes: [
          {
            id: crimeIds.c5_1,
            date: '2025-01-01',
            articleId: '105',
            partId: '1',
            pointId: '',
            category: 'особо тяжкое',
            intent: 'умышленное',
            juvenile: false
          }
        ],
        punishment: {
          mainType: 'imprisonment',
          mainReal: true,
          mainConditional: false,
          mainTermYears: 10,
          mainTermMonths: 0,
          conditionalCancelledDate: '',
          probationYears: 0,
          probationMonths: 0,
          deferment: false,
          defermentCancelledDate: '',
          udoDate: '',
          mainEndDate: '2025-12-01',
          additionalType: '',
          additionalEndDate: ''
        }
      }
    ],

    // Merge operations
    mergeOps: [
      // Операция A: ст.70 и 74 (отмена условного)
      // Основной: №2, влился: №1 (условный)
      // Дата отбытия по основному: 01.12.2018
      {
        id: opIds.A,
        basis: 'ст. 70 и 74 УК РФ',
        childNodeIds: [`conviction:${convIds['1']}`],
        parentNodeId: `conviction:${convIds['2']}`,
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
      // Операция B: ч.5 ст.69
      // Основной: №4, влился: №3
      // Дата отбытия по основному узлу: 01.01.2024
      {
        id: opIds.B,
        basis: 'ч. 5 ст. 69 УК РФ',
        childNodeIds: [`conviction:${convIds['3']}`],
        parentNodeId: `conviction:${convIds['4']}`,
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
      // Операция C: ч.5 ст.69 (цепочка - использует результат opB)
      // Основной: №5, влился: узел результата opB (merge:op-gorbunov-B)
      // Дата отбытия по основному узлу: 01.12.2025
      {
        id: opIds.C,
        basis: 'ч. 5 ст. 69 УК РФ',
        childNodeIds: [`merge:${opIds.B}`],
        parentNodeId: `conviction:${convIds['5']}`,
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
    ],

    creatingOp: {
      basis: 'ч. 5 ст. 69 УК РФ',
      childNodeIds: [],
      parentNodeId: ''
    }
  };
}
