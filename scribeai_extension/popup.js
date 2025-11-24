// Popup script
document.addEventListener('DOMContentLoaded', () => {
  // Display version
  const manifest = chrome.runtime.getManifest();
  document.getElementById('version').textContent = manifest.version;
  
  // Check extension status
  chrome.runtime.sendMessage({ action: 'checkExtension' }, (response) => {
    if (response && response.installed) {
      document.getElementById('status').textContent = 'Active';
    } else {
      document.getElementById('status').textContent = 'Error';
      document.getElementById('status').style.background = '#ef4444';
    }
  });
});