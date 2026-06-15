document.addEventListener("DOMContentLoaded", loadChannels);

async function loadChannels() {
  const { twitchme } = await chrome.storage.sync.get("twitchme");
  const channels = twitchme?.channels || [];
  const container = document.getElementById("channelRules");
  const noChannels = document.getElementById("noChannels");
  const copyAllBtn = document.getElementById("copyAllBtn");

  if (channels.length === 0) {
    noChannels.style.display = "block";
    return;
  }

  const rules = channels.map((ch) => `@@||twitch.tv/${ch.name}$document`);

  rules.forEach((rule) => {
    const row = document.createElement("div");
    row.className = "rule-row";

    const code = document.createElement("code");
    code.textContent = rule;

    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "Copy";
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(rule).then(() => {
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = "Copy"), 1500);
      });
    });

    row.appendChild(code);
    row.appendChild(btn);
    container.appendChild(row);
  });

  copyAllBtn.style.display = "inline-block";
  copyAllBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(rules.join("\n")).then(() => {
      copyAllBtn.textContent = "Copied!";
      setTimeout(() => (copyAllBtn.textContent = "Copy All Rules"), 1500);
    });
  });
}
