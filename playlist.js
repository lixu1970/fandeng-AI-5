/* ============================================================
 * 樊登讲书 · 有声书库 — 内容清单
 * 版本：v1.0.1
 *
 * 以后每增加 5 集，只需要：
 *   1. 把 5 个音频放进 audio/ 目录（命名如 ep226.m4a）
 *   2. 在 tracks 里追加 5 条记录
 *   3. 在 batches 里追加 1 个批次（第 2 辑、第 3 辑……）
 *   4. 修改 site.version 与 changelog
 * ============================================================ */

window.LIBRARY = {
  site: {
    title: "樊登讲书",
    subtitle: "有声书库",
    brandChar: "樊",
    version: "1.0.1",
    released: "2026-11-15",
    description: "樊登讲书 · 有声精选，支持锁屏播放、倍速与单集分享。"
  },

  /* 每 5 集为一辑；新增时追加即可 */
  batches: [
    {
      id: 1,
      name: "第 1 辑",
      date: "2026-11-14",
      note: "首批 5 集"
    }
  ],

  /* 曲目：id 用于链接与本地记录；no 用于排序与显示 */
  tracks: [
    {
      id: "ep176",
      no: 176,
      batch: 1,
      title: "第 176 期",
      subtitle: "樊登讲书 · 有声精选",
      file: "audio/ep176.m4a",
      duration: 4106,
      accent: "#e8b46c",
      coverA: "#3a2a1b",
      coverB: "#0f0c09",
      tag: "讲书"
    },
    {
      id: "ep190",
      no: 190,
      batch: 1,
      title: "第 190 期",
      subtitle: "樊登讲书 · 有声精选",
      file: "audio/ep190.m4a",
      duration: 5156,
      accent: "#8fc7b6",
      coverA: "#1e2c29",
      coverB: "#0a0f0e",
      tag: "讲书"
    },
    {
      id: "ep199",
      no: 199,
      batch: 1,
      title: "第 199 期",
      subtitle: "樊登讲书 · 有声精选",
      file: "audio/ep199.m4a",
      duration: 3153,
      accent: "#c7a3dd",
      coverA: "#2b2233",
      coverB: "#0e0b12",
      tag: "讲书"
    },
    {
      id: "ep213",
      no: 213,
      batch: 1,
      title: "第 213 期",
      subtitle: "樊登讲书 · 有声精选",
      file: "audio/ep213.m4a",
      duration: 4107,
      accent: "#e39a86",
      coverA: "#2e2020",
      coverB: "#120c0c",
      tag: "讲书"
    },
    {
      id: "ep225",
      no: 225,
      batch: 1,
      title: "第 225 期",
      subtitle: "樊登讲书 · 有声精选",
      file: "audio/ep225.m4a",
      duration: 4257,
      accent: "#9bb8dc",
      coverA: "#1d2633",
      coverB: "#0a0d13",
      tag: "讲书"
    }
  ],

  /* 版本记录：最新的写在最上面 */
  changelog: [
    {
      version: "1.0.1",
      date: "2026-11-14",
      title: "首次发布",
      items: [
        "首批上线 5 集音频，共约 5 小时 46 分",
        "支持锁屏 / 熄屏播放，锁屏界面可控制上一集、下一集",
        "支持单集分享链接、倍速播放、定时关闭",
        "支持收藏、最近播放、断点续听（记录保存在本机）"
      ]
    }
  ]
};
