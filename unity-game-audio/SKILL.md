---
name: unity-game-audio
description: Unity 游戏的音频设计与接入角色。需要规划、生成、审查、压缩、授权或接入音乐、音效、语音、AudioMixer、空间音频与 Windows 音频行为时使用。
---

# Unity 游戏音频

## 输入与决策

读取 Work Item、相关音频、代码、项目配置、GDD/TDD、资源登记与音频计划。音频方向、授权、响度、预算、外部成本或发布资格存在实质取舍时交给 `$unity-game-grilling`；购买、上传或外部生成还必须由控制面取得精确操作批准。

## 执行与交接

AudioSource→AudioMixer 分组与场景扫描交给 `unity:audio-setup-mixers`，Importer、Load Type、编码、采样率和 Mixer 性能优化交给 `unity:optimize-audio`；Vivox 语音/文字聊天交给 `unity:setup-vivox-voice-chat`。本角色保留音频方向、事件语义、来源授权、预算和跨领域交接，不复制插件操作流程。项目音频生命周期还需遵守[基础工程要求](../unity-development-workflow/references/foundation-workflow.md)与[TDD 生命周期记录](../unity-development-workflow/templates/project-docs/TDD.md)。

1. 按核心反馈、UI、环境、音乐、语音和可访问性定义事件、优先级与静默降级行为。
2. 在资源登记记录来源、授权/生成、格式、采样率、声道、时长、循环点、响度、压缩、加载方式、大小、用途和发布资格。
3. 用 AudioMixer 规划 Master/Music/SFX/Voice/UI 分组、音量、Duck、并发限制和持久设置；避免每次播放产生不必要分配。
4. 音频服务统一处理应用后台、窗口失焦和系统音频中断：用暂停原因集合合并系统、手动和玩法暂停，重复通知必须幂等；只有所有暂停原因都解除且播放实例此前仍应播放时，才从原播放位置恢复。`Stop`、销毁、场景卸载或用户主动停止会使旧播放请求失效，后续恢复不能复活它；后台期间的新播放请求直接丢弃，不排队补播。平台不支持精确定位的资源需在 TDD 记录可验证的恢复精度与降级行为。
5. 验证首次播放、暂停恢复、窗口失焦、设备切换、静音、循环、场景切换、重复生命周期通知、停止/销毁后的恢复边界、后台新请求和资源缺失；在 Windows 候选环境检查实际输出。目标含 Android 时，在获准的设备验证中复核系统中断和前后台恢复。
6. 向玩法提供事件/资源标识、触发时机与生命周期，向 QA 提供功能、响度和预算检查，向发布同步授权状态。

新增或修改的类、函数和实体定义必须有说明生命周期、并发或性能取舍的简体中文注释。
