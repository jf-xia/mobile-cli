---
name: android-automation
description: "在 VS Code 中执行 Android 真机与模拟器自动化。用于设备巡检、应用安装启动、界面元素读取、点击输入、截图、录屏、崩溃查看与 Android 远程设备申请。"
argument-hint: "描述 Android 自动化任务，例如：列出设备、安装 APK、截图、查看界面元素、开始录屏"
user-invocable: true
---

# Android 自动化技能

## 适用场景

- 需要列出当前可用的 Android 真机或模拟器。
- 需要安装、启动、终止、卸载 Android 应用。
- 需要读取当前页面元素、执行点击、双击、长按、输入、滑动、按键、打开链接。
- 需要保存截图、开始或停止录屏、读取 crash 信息。
- 需要通过 skill 中自带脚本直接执行 Android 自动化，不依赖仓库外部源码。

## 运行入口

直接执行 skill 自带 TS 脚本：

```bash
./scripts/android-automation.ts doctor
./scripts/android-automation.ts devices:list
```

脚本启动时会先检查 `mobilecli`。如果未安装，会自动执行：

```bash
npm install -g mobilecli@latest
```

## 推荐流程

1. 先运行 `doctor` 和 `devices:list`。
2. 选定设备 ID。
3. 再运行应用管理或屏幕交互命令。
4. 对截图、录屏等产物指定输出路径。

## 常用命令

```bash
./scripts/android-automation.ts doctor
./scripts/android-automation.ts devices:list
./scripts/android-automation.ts apps:list --device <device-id>
./scripts/android-automation.ts apps:install --device <device-id> --path ./app.apk
./scripts/android-automation.ts screen:elements --device <device-id>
./scripts/android-automation.ts screen:screenshot --device <device-id> --output ./tmp/screen.png
./scripts/android-automation.ts screen:record-start --device <device-id> --output ./tmp/demo.mp4
./scripts/android-automation.ts screen:record-stop --device <device-id>
```

更多命令见 [命令参考](./references/command-reference.md)。限制说明见 [限制说明](./references/limitations.md)。
