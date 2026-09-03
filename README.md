# XWX

课堂实时语音转写 + 翻译 + AI 总结。

- **官网 / 首页**:`index.html` + `landing.css` —— 产品介绍与下载入口。
- **网页版应用**:`app/` —— 实际功能页面(纯静态,无后端)。
- **Windows 客户端**:见 [Releases](https://github.com/xianwuxing/xwx/releases),源码在
  [`classroom-translator/`](https://github.com/xianwuxing/xwx#desktop) (Electron,单独仓库/目录维护)。

## 使用

打开网页版即可用,右上角"设置"里可选填 OpenAI API Key:

- **不填 Key**:免费方案,用浏览器内置的 Web Speech API 识别 + MyMemory 免费翻译 + 规则摘要。
  需要用 Chrome 或 Edge 打开(Safari/Firefox 不支持 Web Speech API)。
- **填 Key**:识别用 Whisper、翻译和总结用 GPT-4o-mini,准确率和速度更好。Key 只保存在你
  当前浏览器的 `localStorage` 里,不会上传到任何服务器(本站没有后端,所有请求都是浏览器
  直接打给 OpenAI/MyMemory 官方接口)。

结束录制时会自动把转写、翻译、AI 总结打包成 `.md` 和 `.json` 两个文件下载到本地"下载"文件夹。

## 本地开发

纯静态文件,任意静态服务器都能跑,例如:

```bash
python -m http.server 8080
```

然后打开 http://localhost:8080(官网)或 http://localhost:8080/app/(应用)。

## 部署

托管在 GitHub Pages,推送到 `main` 分支即自动发布,无需构建步骤。
