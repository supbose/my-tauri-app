import 'dotenv/config';
import fetch from "node-fetch";
import { getOctokit, context } from "@actions/github";
import fs from "fs";

import updatelog from "./updatelog.mjs";

const token = process.env.GITHUB_TOKEN;

async function updater() {
  if (!token) {
    console.log("GITHUB_TOKEN is required");
    process.exit(1);
  }

  // 用户名，仓库名 - 支持本地环境
  let owner, repo;
  
  // 检查是否在 GitHub Actions 环境中（有 GITHUB_REPOSITORY 环境变量）
  if (process.env.GITHUB_REPOSITORY) {
    // 在 GitHub Actions 环境中，可以安全地使用 context.repo
    try {
      owner = context.repo.owner;
      repo = context.repo.repo;
      console.log(`Using repository info from context: ${owner}/${repo}`);
    } catch (error) {
      // 如果 context.repo 访问失败，使用 GITHUB_REPOSITORY 环境变量
      const repoParts = process.env.GITHUB_REPOSITORY.split('/');
      if (repoParts.length === 2) {
        [owner, repo] = repoParts;
        console.log(`Using repository info from GITHUB_REPOSITORY: ${owner}/${repo}`);
      }
    }
  } else {
    // 本地开发环境，从环境变量获取或使用默认值
    owner = process.env.GITHUB_OWNER || "user";
    repo = process.env.GITHUB_REPO || "my-tauri-app";
    console.log(`Using repository info from environment/default: ${owner}/${repo}`);
    console.log("Note: In a real GitHub Actions environment, this would be automatically detected.");
  }
  
  const options = { owner, repo };
  const github = getOctokit(token);
  
  let updateData = {
    version: "1.0.0",
    notes: "这是一个示例更新说明",
    pub_date: new Date().toISOString(),
    platforms: {
      win64: { signature: "", url: "" },
      linux: { signature: "", url: "" },
      darwin: { signature: "", url: "" },
      "darwin-aarch64": { signature: "", url: "" },
      "darwin-x86_64": { signature: "", url: "" },
      "linux-x86_64": { signature: "", url: "" },
      "windows-x86_64": { signature: "", url: "" },
    },
  };

  try {
    // 获取 tag
    console.log(`尝试获取仓库 ${owner}/${repo} 的标签信息...`);
    const { data: tags } = await github.rest.repos.listTags({
      ...options,
      per_page: 10,
      page: 1,
    });

    // 过滤包含 `v` 版本信息的 tag
    const tag = tags.find((t) => t.name.startsWith("v"));
    
    if (!tag) {
      console.log("未找到以 'v' 开头的标签，使用默认版本信息");
    } else {
      console.log(`找到标签: ${tag.name}`);
      
      // 获取此 tag 的详细信息
      const { data: latestRelease } = await github.rest.repos.getReleaseByTag({
        ...options,
        tag: tag.name,
      });

      // 更新数据
      updateData.version = tag.name;
      updateData.notes = updatelog(tag.name) || "这是一个示例更新说明";
      updateData.pub_date = new Date().toISOString();

      const setAsset = async (asset, reg, platforms) => {
        let sig = "";
        if (/.sig$/.test(asset.name)) {
          sig = await getSignature(asset.browser_download_url);
        }
        platforms.forEach((platform) => {
          if (reg.test(asset.name)) {
            // 设置平台签名，检测应用更新需要验证签名
            if (sig) {
              updateData.platforms[platform].signature = sig;
              return;
            }
            // 设置下载链接
            updateData.platforms[platform].url = asset.browser_download_url;
          }
        });
      };

      const promises = latestRelease.assets.map(async (asset) => {
        // windows
        await setAsset(asset, /.msi.zip/, ["win64", "windows-x86_64"]);

        // darwin
        await setAsset(asset, /.app.tar.gz/, [
          "darwin",
          "darwin-x86_64",
          "darwin-aarch64",
        ]);

        // linux
        await setAsset(asset, /.AppImage.tar.gz/, ["linux", "linux-x86_64"]);
      });
      await Promise.allSettled(promises);
    }
  } catch (error) {
    console.error("获取 GitHub 数据时出错:", error.message);
    console.log("使用示例数据生成更新文件");
    
    // 从 latest.json 获取一些真实数据（如果存在）
    try {
      if (fs.existsSync('./latest.json')) {
        const latestData = JSON.parse(fs.readFileSync('./latest.json', 'utf8'));
        if (latestData.version) updateData.version = latestData.version;
        if (latestData.notes) updateData.notes = latestData.notes;
        if (latestData.platforms) updateData.platforms = { ...updateData.platforms, ...latestData.platforms };
        console.log("从 latest.json 读取了部分更新信息");
      }
    } catch (e) {
      console.log("无法读取 latest.json，使用默认示例数据");
    }
  }

  if (!fs.existsSync("updater")) {
    fs.mkdirSync("updater");
  }

  // 将数据写入文件
  fs.writeFileSync(
    "./updater/install.json",
    JSON.stringify(updateData, null, 2)
  );
  console.log("成功生成 updater/install.json 文件");
  console.log(`版本: ${updateData.version}`);
  console.log(`发布日期: ${updateData.pub_date}`);
}

updater().catch(console.error);

// 获取签名内容
async function getSignature(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/octet-stream" },
    });
    return response.text();
  } catch (_) {
    return "";
  }
}