/** 校验同一九宫格声明的源尺寸、边框与目标显示空间。 */
export function validateNineSliceDecision(decision, targetSize = null) {
  const errors = [];
  if (!decision || !['stretch', 'not-applicable'].includes(decision.mode) || typeof decision.reason !== 'string' || !decision.reason.trim()) return ['nineSlice 必须明确适用性与理由'];
  const allowed = decision.mode === 'stretch' ? ['mode', 'reason', 'sourceSize', 'border'] : ['mode', 'reason'];
  if (Object.keys(decision).some((key) => !allowed.includes(key))) errors.push('nineSlice 含未声明字段');
  if (decision.mode === 'not-applicable') return errors;
  const border = decision.border;
  const size = decision.sourceSize;
  if (!size || !['width', 'height'].every((key) => Number.isInteger(size[key]) && size[key] > 0) || Object.keys(size).some((key) => !['width', 'height'].includes(key))) errors.push('nineSlice.sourceSize 必须是实际生产源像素尺寸');
  if (!Array.isArray(border) || border.length !== 4 || border.some((value) => !Number.isInteger(value) || value < 0) || !border.some((value) => value > 0)) return [...errors, 'nineSlice.border 必须为有固定边的四个非负整数'];
  // Unity 使用 left,bottom,right,top；源纹理与显示框均须保留正尺寸的中心。
  for (const [name, value] of [['源图', size], ['显示框', targetSize]]) {
    if (!value) continue;
    if (!Number.isFinite(value.width) || !Number.isFinite(value.height) || border[0] + border[2] >= value.width || border[1] + border[3] >= value.height) errors.push(`九宫格${name}没有正尺寸中心`);
  }
  return errors;
}

/** 核对 V2、图片任务、实际导入登记和组合绑定使用同一份切片事实。 */
export function validateNineSliceProduction(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['九宫格验证材料必须是对象'];
  const { item, task, registration, binding, placements } = input;
  const errors = validateNineSliceDecision(item?.nineSlice);
  if (errors.length) return errors;
  if (!task || !registration || !binding) return ['九宫格生产缺少任务、导入登记或组合绑定'];
  for (const [name, object, keys] of [['V2', item, ['id', 'resourceId']], ['任务', task, ['id', 'resourceId', 'sourceVersion']], ['登记', registration, ['taskId', 'resourceId', 'sourceVersion', 'assetGuid', 'assetPath']], ['组合', binding, ['itemId', 'resourceId', 'assetGuid', 'assetPath']]]) {
    if (typeof object !== 'object' || Array.isArray(object) || keys.some((key) => typeof object[key] !== 'string' || !object[key].trim())) errors.push(`${name}缺少非空资源身份或路径`);
  }
  if (errors.length) return errors;
  if (typeof item.resourceId !== 'string' || !item.resourceId.trim() || task.resourceId !== item.resourceId || registration.taskId !== task.id || registration.resourceId !== task.resourceId || binding.resourceId !== task.resourceId || binding.itemId !== item.id || registration.sourceVersion !== task.sourceVersion) errors.push('九宫格工作项与正式资源身份不一致');
  if (!registration.assetGuid || binding.assetGuid !== registration.assetGuid || binding.assetPath !== registration.assetPath || registration.unityValidation !== 'PASS') errors.push('九宫格组合必须绑定已回读的实际 GUID 和路径');
  for (const [name, decision] of [['图片任务', task.nineSlice], ['组合', binding.nineSlice]]) {
    errors.push(...validateNineSliceDecision(decision));
    if (decision?.mode !== item.nineSlice.mode || (decision?.mode === 'stretch' && (JSON.stringify(decision.border) !== JSON.stringify(item.nineSlice.border) || decision.sourceSize?.width !== item.nineSlice.sourceSize.width || decision.sourceSize?.height !== item.nineSlice.sourceSize.height))) errors.push(`${name}切片事实与 V2 不一致`);
  }
  const expected = item.nineSlice.mode === 'stretch' ? item.nineSlice.border : [0, 0, 0, 0];
  for (const [name, importer] of [['任务', task.unityImport], ['导入登记', registration.importer]]) {
    if (item.nineSlice.mode === 'stretch') {
      if (importer?.textureType !== 'Sprite' || importer.spriteMode !== 'Single' || JSON.stringify(importer.border) !== JSON.stringify(expected)) errors.push(`${name} Sprite Border 与冻结切片不一致`);
    } else if (!importer || (importer.border !== undefined && JSON.stringify(importer.border) !== JSON.stringify(expected))) errors.push(`${name}不适用九宫格却声明了非零边框`);
  }
  if (item.nineSlice.mode === 'stretch') {
    if (!Array.isArray(placements) || placements.length === 0) errors.push('九宫格缺少实际消费者呈现检查');
    const seen = new Set();
    for (const placement of Array.isArray(placements) ? placements : []) {
      if (!placement || typeof placement !== 'object') { errors.push('九宫格消费者必须是实测对象'); continue; }
      if (seen.has(placement.nodeId)) errors.push('九宫格消费者不能重复');
      seen.add(placement.nodeId);
      if (!placement.size || !['width', 'height'].every((key) => Number.isFinite(placement.size[key]) && placement.size[key] > 0)) errors.push('九宫格消费者必须提供正尺寸显示框');
      const ratio = placement.borderPixelsToUnits;
      if (!['SCREEN_PIXELS', 'UNITY_LOGICAL_UNITS'].includes(placement.coordinateSpace) || !Number.isFinite(ratio) || ratio <= 0) errors.push('九宫格消费者必须声明实测坐标空间和源像素转换比例');
      // Border 是源像素；用实际 PPU/Canvas 或 Panel 切片比例转换后才能与显示框比较。
      if (placement.size && Number.isFinite(ratio) && ratio > 0 && (expected[0] * ratio + expected[2] * ratio >= placement.size.width || expected[1] * ratio + expected[3] * ratio >= placement.size.height)) errors.push('九宫格显示框没有正尺寸中心');
      // 这里只核对来自 Unity 的几何/组件回读，接缝和角部画质仍需人工检查。
      if (placement.measured !== true || !Array.isArray(binding.consumerNodeIds) || !binding.consumerNodeIds.includes(placement.nodeId) || !['UGUI_SLICED', 'UITOOLKIT_SLICED'].includes(placement.presentation) || JSON.stringify(placement.border) !== JSON.stringify(expected)) errors.push('消费者缺少实际切片呈现或边框回读');
    }
    if (!Array.isArray(binding.consumerNodeIds) || binding.consumerNodeIds.length === 0 || binding.consumerNodeIds.some((nodeId) => !seen.has(nodeId))) errors.push('九宫格消费者检查覆盖不完整');
  }
  return [...new Set(errors)];
}
