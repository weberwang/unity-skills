# TMP 多语言字体图集流程

## 适用范围

适用于使用 uGUI/TextMeshPro 和 Unity Localization String Tables 的屏幕 UI。UI Toolkit 的字体资产与应用流程另按其 Text Settings/FontAsset 路线实施，不把 TMP_FontAsset 直接赋给 TextElement。

## 字体来源与项目存放

默认从官方来源选择以下字体；项目美术风格需要其他字体时，可以替换，但必须逐语言检查字形覆盖与项目使用许可。

| 语言 | 默认字体 | 官方来源 |
| --- | --- | --- |
| `en`、`ru`、`es` | Noto Sans，覆盖拉丁与西里尔文字 | [Google Fonts：Noto Sans](https://fonts.google.com/specimen/Noto+Sans) |
| `zh-CN` | Noto Sans SC，使用简体中文地区字形 | [Google Fonts：Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC) |
| `ja` | Noto Sans JP，使用日文地区字形 | [Google Fonts：Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP) |

中文和日文需要完整地区字形源文件时，按 [Noto Sans CJK 官方下载说明](https://github.com/notofonts/noto-cjk/blob/main/Sans/README.md)选择 Language-specific OTF 的 Simplified Chinese/Japanese 文件，并按项目需要取 Regular 等具体字重。以上页面是来源入口，不固定发布 ZIP 直链或版本。下载时核对该文件随附的授权与版权声明；例如 Noto Latin 仓库提供 [OFL 授权文件](https://github.com/notofonts/latin-greek-cyrillic/blob/main/OFL.txt)。

将选定的 `.ttf/.otf`、对应授权文件及 Unity `.meta` 保存在**游戏项目**的 `Assets/UI/Fonts/Source/`，生成资产放在 `Assets/UI/Fonts/Generated/`；通用工作流只保存选择规则和生成脚本，不打包字体文件。记录实际来源页面、下载日期、字体版本、字重和授权文件，替换字体后重新生成图集。

## 基础模块与资源

1. 在 `Assets/` 导入有项目使用许可的完整源字体：拉丁与西里尔字符一组（`en`、`ru`、`es`），简体中文一组（`zh-CN`），日文字形一组（`ja`）。检查西语重音和倒置标点、俄语 `Ёё`、中日地区字形。
2. 配齐五语言的 Unity Localization String Tables。动态变量可能出现的数字、物品名、用户输入等不依赖静态表的字符，按实际来源分别列入额外字符文件或动态回退策略；不能以预览中的少量样本文字推定覆盖完整。
3. 创建 `TmpFontAtlasPlan` 资产，按上述三组填写 `localeCodes`、`sourceFont`、图集参数、可选 `dynamicFallback`、`extraCharacterFiles` 与需要应用的 Prefab 上的 `LocalizedTmpFontBinder` 目标。场景实例不能持久存进计划资产，生成器会自动处理当前已打开场景中的绑定器；需要处理其他场景时逐一打开并运行生成器。动态回退资产需从有许可的源字体创建为 Dynamic TMP Font Asset，按平台预算控制图集和构建时动态数据；没有未知文本时不配置回退。
4. 选中计划资产，执行 `Tools > Unity Workflow > Build TMP Font Atlases`。脚本汇总每个 String Table 的 `GenerateCharacterSet()`、额外字符文件，按 Unicode 码点去重；已知文案缺字或图集容量不足时失败，不把动态回退当作已知文案的遮掩。成功后按内容哈希生成静态字体资产，同一输入重复执行复用同一资产，并为目标绑定器写入五语言映射；处理场景实例后保存场景。
5. `LocalizedTmpFontBinder` 随 Unity Localization 的当前 Locale 切换字体。`en`、`ru`、`es` 可指向同一静态资产，`zh-CN` 与 `ja` 使用各自资产，避免同码点汉字套用错误地区字形。文本内容本身仍由项目本地化组件或业务逻辑更新。

## 验收与更新

- 改动 String Table、额外字符文件、源字体或图集参数后重新生成。内容哈希变化时产出新资产并重绑目标；确认无引用后，旧资产在集成阶段清理，不直接覆盖旧 GUID。
- 检查每种语言的所有实际 UI 状态、换行、基线、字号、安全区和缺字；在 V4 记录设备/视口截图与字体回退结果。动态玩家输入另测未知字符与回退图集增长，不能用静态样本替代。
- 生成的字体资产和材料、纹理子资产应被 Unity 重新载入并验证；没有真实 Unity 导入和渲染证据时，不把字体流程标记为通过。
