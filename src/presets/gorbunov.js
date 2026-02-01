/**
 * Горбунов базовый сценарий (preset=1)
 * Полный набор данных для тестирования калькулятора рецидива
 * 4 новых преступления, 5 приговоров, 3 операции соединения (включая цепочку)
 */

export function createGorbunovPreset() {
  // Generate stable IDs for reproducibility
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

  // Birth date: 01.01.1970
  const birthDate = '1970-01-01';

  // ==================== NEW CRIMES ====================
  const newCrimes = [
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
  ];

  // ==================== CONVICTIONS ====================
  const convictions = [
    {
      id: convIds['1'],
      verdictDate: '2015-01-01',
      legalDate: '2015-02-01',
      pre2013: false,
      crimes: [
        {
          id: crimeIds.c1_1,
          date: '2014-12-01',
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
        conditionalCancelledDate: '',
        deferment: false,
        defermentCancelledDate: '',
        udoDate: '',
        mainEndDate: '',
        additionalType: '',
        additionalEndDate: ''
      }
    },
    {
      id: convIds['2'],
      verdictDate: '2015-04-01',
      legalDate: '2015-05-01',
      pre2013: false,
      crimes: [
        {
          id: crimeIds.c2_1,
          date: '2015-03-15',
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
        conditionalCancelledDate: '',
        deferment: false,
        defermentCancelledDate: '',
        udoDate: '',
        mainEndDate: '2018-04-01',
        additionalType: '',
        additionalEndDate: ''
      }
    },
    {
      id: convIds['3'],
      verdictDate: '2019-01-01',
      legalDate: '2019-02-01',
      pre2013: false,
      crimes: [
        {
          id: crimeIds.c3_1,
          date: '2018-12-15',
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
        mainEndDate: '2023-01-01',
        additionalType: '',
        additionalEndDate: ''
      }
    },
    {
      id: convIds['4'],
      verdictDate: '2019-03-01',
      legalDate: '2019-04-01',
      pre2013: false,
      crimes: [
        {
          id: crimeIds.c4_1,
          date: '2019-02-15',
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
        mainEndDate: '2024-03-01',
        additionalType: '',
        additionalEndDate: ''
      }
    },
    {
      id: convIds['5'],
      verdictDate: '2025-01-01',
      legalDate: '2025-02-01',
      pre2013: false,
      crimes: [
        {
          id: crimeIds.c5_1,
          date: '2024-12-15',
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
        mainEndDate: '2029-01-01',
        additionalType: '',
        additionalEndDate: ''
      }
    }
  ];

  // ==================== MERGE OPERATIONS ====================
  // Operation A: ст.70+74 - merges conviction 1 (conditional) + conviction 2 (real)
  // Result node: merge:op-gorbunov-A
  const opA = {
    id: opIds.A,
    basis: 'ст. 70 и 74 УК РФ',
    childNodeIds: [`conviction:${convIds['1']}`, `conviction:${convIds['2']}`],
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
  };

  // Operation B: ч.5 ст.69 - merges conviction 3 + conviction 4
  // Result node: merge:op-gorbunov-B
  const opB = {
    id: opIds.B,
    basis: 'ч. 5 ст. 69 УК РФ',
    childNodeIds: [`conviction:${convIds['3']}`, `conviction:${convIds['4']}`],
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
  };

  // Operation C: ч.5 ст.69 (chain) - merges result of opB + conviction 5
  // Important: uses merge:op-gorbunov-B (the result node of opB), NOT conviction 4 directly
  const opC = {
    id: opIds.C,
    basis: 'ч. 5 ст. 69 УК РФ',
    childNodeIds: [`merge:${opIds.B}`, `conviction:${convIds['5']}`],
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
  };

  const mergeOps = [opA, opB, opC];

  return {
    birthDate,
    newCrimes,
    convictions,
    mergeOps,
    creatingOp: {
      basis: 'ч. 5 ст. 69 УК РФ',
      childNodeIds: [],
      parentNodeId: ''
    }
  };
}
