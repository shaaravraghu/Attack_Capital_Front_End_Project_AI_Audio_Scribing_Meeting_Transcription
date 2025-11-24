// Content script - injects into web pages to enable tab capture

console.log('ScribeAI Tab Capture extension loaded');

// Inject the extension API into the page
const injectAPI = () => {
  // Check if already injected
  if (window.scribeAIExtension) {
    console.log('API already injected');
    return;
  }

  // Create API object
  window.scribeAIExtension = {
    installed: true,
    
    async startTabCapture() {
      return new Promise((resolve, reject) => {
        const messageId = Math.random().toString(36).substr(2, 9);
        
        window.postMessage({ 
          type: 'SCRIBEAI_START_TAB_CAPTURE',
          messageId 
        }, '*');
        
        // Listen for response
        const listener = (event) => {
          if (event.data.type === 'SCRIBEAI_TAB_CAPTURE_RESPONSE' && 
              event.data.messageId === messageId) {
            window.removeEventListener('message', listener);
            if (event.data.success) {
              resolve(event.data);
            } else {
              reject(new Error(event.data.error || 'Failed to start tab capture'));
            }
          }
        };
        
        window.addEventListener('message', listener);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          window.removeEventListener('message', listener);
          reject(new Error('Tab capture request timeout'));
        }, 10000);
      });
    },
    
    stopTabCapture() {
      window.postMessage({ 
        type: 'SCRIBEAI_STOP_TAB_CAPTURE' 
      }, '*');
    }
  };
  
  console.log('ScribeAI extension API injected');
  
  // Dispatch event to notify page that extension is ready
  window.dispatchEvent(new CustomEvent('scribeai-extension-ready'));
};

// Inject immediately
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectAPI);
} else {
  injectAPI();
}

// Listen for messages from the page
window.addEventListener('message', async (event) => {
  // Only accept messages from same origin
  if (event.source !== window) return;
  
  if (event.data.type === 'SCRIBEAI_START_TAB_CAPTURE') {
    console.log('Content script: Received start tab capture request');
    
    try {
      // Request stream ID from background
      const response = await chrome.runtime.sendMessage({
        action: 'getStreamId'
      });
      
      console.log('Content script: Background response:', response);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to get stream ID');
      }
      
      // Send stream ID back to page
      window.postMessage({
        type: 'SCRIBEAI_TAB_CAPTURE_RESPONSE',
        messageId: event.data.messageId,
        success: true,
        streamId: response.streamId
      }, '*');
      
    } catch (error) {
      console.error('Content script: Error starting tab capture:', error);
      window.postMessage({
        type: 'SCRIBEAI_TAB_CAPTURE_RESPONSE',
        messageId: event.data.messageId,
        success: false,
        error: error.message
      }, '*');
    }
  }
  
  if (event.data.type === 'SCRIBEAI_STOP_TAB_CAPTURE') {
    console.log('Content script: Received stop tab capture request');
    
    try {
      await chrome.runtime.sendMessage({
        action: 'stopTabCapture'
      });
    } catch (error) {
      console.error('Content script: Error stopping tab capture:', error);
    }
  }
});