document.addEventListener('DOMContentLoaded', loadSettings)
document.getElementById('saveBtn').addEventListener('click', saveSettings)

async function loadSettings() {
  const { twitchme } = await chrome.storage.sync.get('twitchme')
  const d = twitchme || {}

  document.getElementById('pollingInterval').value = String(d.settings?.pollingInterval ?? 1)
  document.getElementById('autoClose').checked = d.settings?.autoClose !== false

  renderChannels(d.channels || [])
}

function renderChannels(channels) {
  const list = document.getElementById('channelList')
  list.innerHTML = ''

  if (channels.length === 0) {
    list.innerHTML = '<p class="empty-channels">No channels added yet.</p>'
    return
  }

  channels.forEach(ch => {
    const tag = document.createElement('span')
    tag.className = 'channel-tag'
    tag.innerHTML = `${ch.name} <span class="remove" data-channel="${ch.name}">&times;</span>`
    tag.querySelector('.remove').addEventListener('click', async () => {
      chrome.runtime.sendMessage({ type: 'REMOVE_CHANNEL', channel: ch.name }, (data) => {
        renderChannels(data.channels)
      })
    })
    list.appendChild(tag)
  })
}

async function saveSettings() {
  const settings = {
    pollingInterval: parseFloat(document.getElementById('pollingInterval').value) || 1,
    autoClose: document.getElementById('autoClose').checked
  }

  const status = document.getElementById('saveStatus')
  status.textContent = 'Saving...'
  status.style.color = '#adadb8'

  chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings }, () => {
    status.textContent = 'Saved!'
    status.style.color = '#00d94e'
    setTimeout(() => { status.textContent = '' }, 2000)
  })
}
