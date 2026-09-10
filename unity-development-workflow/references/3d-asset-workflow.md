# Unity 3D 资源工作流

3D 模型、UV、PBR、LOD、Collider、Rig、动画前置和 Prefab 仍嵌入 V0-V4。

1. **V0/V1 规格与 Blockout**：冻结世界尺寸、轴向、Pivot、轮廓、观看距离、交互边界、拓扑/UV/材质槽/LOD/Collider/动画预算，并提交目标机位下可查看的 Blockout。
2. **V2 生产边界**：冻结几何、贴图、材质、Rig 和 VFX 的责任划分、资源 ID、目标节点、工具/DCC/供应商、许可、源文件和验证矩阵。外部上传、付费或 DCC 任意代码执行需要精确批准。
3. **V3 逐项生产与组合**：模型角色负责几何、拓扑、法线、UV、LOD 和 Collider；贴图角色负责烘焙、PBR 通道、Texel Density、压缩、MipMap 和 URP 材质。候选分别经 F2 独立领域审查和 Unity 导入验证后组成 Prefab。
4. **V4 场景接入**：单写者接入 Mesh、材质、LOD、Collider、Rig/Animator、Prefab、Addressables 和 Scene，清理 Blockout/占位与残留引用，并在目标灯光、相机、动画、物理和性能条件下运行 EditMode/PlayMode 验证。

不得用高保真渲染、标注图或合成图替代真实 3D 结构。源模型、拓扑、UV、材质槽、骨骼、GUID、地址或 Importer 变化，只失效其实际依赖的 V3/V4 证据。
