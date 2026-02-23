import {
  createDangerousRecidivismPreset,
  createGorbunovPreset,
  createNoRecidivismPreset
} from './gorbunov';

export const presetScenarios = [
  { id: 1, label: 'Сценарий 1: Горбунов (цепочка 69/70/74)', factory: createGorbunovPreset },
  { id: 2, label: 'Сценарий 2: Нет рецидива (погашено)', factory: createNoRecidivismPreset },
  { id: 3, label: 'Сценарий 3: Опасный рецидив (2 средней + ЛС)', factory: createDangerousRecidivismPreset }
];

export const getPresetById = (presetId) => {
  const numericId = Number(presetId);
  return presetScenarios.find((scenario) => scenario.id === numericId);
};
