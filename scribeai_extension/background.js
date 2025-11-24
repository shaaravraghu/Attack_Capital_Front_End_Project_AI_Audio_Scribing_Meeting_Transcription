// Background service worker for tab audio capture

let activeStreams = new Map();

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.action);
  
  if (request.action === 'getStreamId') {
    handleGetStreamId(sender.tab.id, sendResponse);
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'stopTabCapture') {
    handleStopCapture(sender.tab.id);
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'checkExtension') {
    sendResponse({ 
      installed: true,
      version: chrome.runtime.getManifest().version 
    });
    return true;
  }
});

async function handleGetStreamId(tabId, sendResponse) {
  try {
    console.log('Getting stream ID for tab:', tabId);
    
    // Check if we already have an active stream for this tab
    if (activeStreams.has(tabId)) {
      const existingStreamId = activeStreams.get(tabId);
      console.log('Reusing existing stream:', existingStreamId);
      sendResponse({ 
        success: true, 
        streamId: existingStreamId 
      });
      return;
    }
    
    // Get current tab info
    const tab = await chrome.tabs.get(tabId);
    console.log('Capturing audio from tab:', tab.title);
    
    // Start tab capture and get stream ID
    chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId
    }, (streamId) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting stream ID:', chrome.runtime.lastError);
        sendResponse({ 
          success: false, 
          error: chrome.runtime.lastError.message 
        });
        return;
      }
      
      if (!streamId) {
        console.error('No stream ID returned');
        sendResponse({ 
          success: false, 
          error: 'Failed to get stream ID for tab capture' 
        });
        return;
      }
      
      console.log('Stream ID obtained:', streamId);
      activeStreams.set(tabId, streamId);
      
      sendResponse({ 
        success: true, 
        streamId: streamId 
      });
    });
  } catch (error) {
    console.error('Error in handleGetStreamId:', error);
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

function handleStopCapture(tabId) {
  console.log('Stopping tab capture for tab:', tabId);
  
  if (activeStreams.has(tabId)) {
    activeStreams.delete(tabId);
    console.log('Stream removed for tab:', tabId);
  }
}

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeStreams.has(tabId)) {
    console.log('Tab closed, cleaning up stream:', tabId);
    activeStreams.delete(tabId);
  }
});