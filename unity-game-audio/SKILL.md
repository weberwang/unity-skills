---
name: unity-game-audio
description: Unity 游戏的音频设计与接入角色。需要规划、生成、审查、压缩、授权或接入音乐、音效、语音、AudioMixer、空间音频与 Windows 音频行为时使用。
---

# Unity 游戏音频

## 输入与决策

读取 Work Item、相关音频、代码、项目配置、GDD/TDD、资源登记与音频计划。音频方向、授权、响度、预算、外部成本或发布资格存在实质取舍时交给 `$unity-game-grilling`；购买、上传或外部生成还必须由控制面取得精确操作批准。

## 执行与交接

AudioSource→AudioMixer 分组与场景扫描交给 `unity:audio-setup-mixers`，Importer、Load Type、编码、采样率和 Mixer 性能优化交给 `unity:optimize-audio`；Vivox 语音/文字聊天交给 `unity:setup-vivox-voice-chat`。本角色保留音频方向、事件语义、来源授权、预算和跨领域交接，不复制插件操作流程。

1. 按核心反馈、UI、环境、音乐、语音和可访问性定义事件、优先级与静默降级行为。
2. 在资源登记记录来源、授权/生成、格式、采样率、声道、时长、循环点、响度、压缩、加载方式、大小、用途和发布资格。
3. 用 AudioMixer 规划 Master/Music/SFX/Voice/UI 分组、音量、Duck、并发限制和持久设置；避免每次播放产生不必要分配。
4. 验证首次播放、暂停恢复、窗口失焦、设备切换、静音、循环、场景切换和资源缺失；在 Windows 候选环境检查实际输出。
5. 向玩法提供事件/资源标识、触发时机与生命周期，向 QA 提供功能、响度和预算检查，向发布同步授权状态。

新增或修改的类、函数和实体定义必须有说明生命周期、并发或性能取舍的简体中文注释。
