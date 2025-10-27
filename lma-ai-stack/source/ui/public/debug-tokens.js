// Debug script - Paste vào browser console để xem full token structure
// Copy toàn bộ và paste vào console khi đang streaming

console.log('%c🔍 TOKEN DEBUG SCRIPT LOADED', 'background: #222; color: #bada55; font-size: 16px; padding: 4px;');
console.log('Waiting for next TOKENS event...');

// Override console.log tạm thời để intercept
const originalLog = console.log;
let tokenCaptured = false;

const interceptor = function(...args) {
  // Call original
  originalLog.apply(console, args);
  
  // Check if this is TOKENS DEBUG
  if (!tokenCaptured && args[0] && args[0].includes && args[0].includes('Token 0:')) {
    const tokenData = args[1];
    
    console.log('%c═══════════════════════════════════════', 'color: #ff6b6b; font-weight: bold;');
    console.log('%c🔍 FULL TOKEN STRUCTURE CAPTURED:', 'color: #ff6b6b; font-size: 14px; font-weight: bold;');
    console.log('%c═══════════════════════════════════════', 'color: #ff6b6b; font-weight: bold;');
    console.log('');
    
    console.log('%c📦 Token Object:', 'color: #4ecdc4; font-weight: bold;');
    console.log(tokenData);
    console.log('');
    
    console.log('%c🔑 All Keys:', 'color: #ffe66d; font-weight: bold;');
    console.log(Object.keys(tokenData));
    console.log('');
    
    console.log('%c📋 Full Details:', 'color: #a8dadc; font-weight: bold;');
    for (const [key, value] of Object.entries(tokenData)) {
      const type = typeof value;
      console.log(`  ${key}: ${JSON.stringify(value)} (${type})`);
    }
    console.log('');
    
    console.log('%c🎯 CRITICAL FIELDS:', 'color: #f77f00; font-weight: bold;');
    console.log(`  ✓ text: "${tokenData.text}"`);
    console.log(`  ✓ translation_status: ${JSON.stringify(tokenData.translation_status)} (${typeof tokenData.translation_status})`);
    console.log(`  ✓ language: ${JSON.stringify(tokenData.language)} (${typeof tokenData.language})`);
    console.log(`  ✓ is_final: ${tokenData.is_final}`);
    console.log(`  ✓ speaker: ${tokenData.speaker}`);
    console.log('');
    
    console.log('%c❓ ANALYSIS:', 'color: #06ffa5; font-weight: bold;');
    
    if (!tokenData.hasOwnProperty('translation_status')) {
      console.log('%c  ❌ PROBLEM: translation_status field DOES NOT EXIST!', 'color: red; font-weight: bold;');
      console.log('%c     → Backend không gửi field này', 'color: red;');
      console.log('%c     → Cần restart backend hoặc check backend code', 'color: red;');
    } else if (tokenData.translation_status === undefined) {
      console.log('%c  ⚠️  WARNING: translation_status = undefined', 'color: orange; font-weight: bold;');
      console.log('%c     → Field tồn tại nhưng giá trị undefined', 'color: orange;');
    } else if (tokenData.translation_status === null) {
      console.log('%c  ℹ️  INFO: translation_status = null (Original token)', 'color: #4ecdc4; font-weight: bold;');
      console.log('%c     → Đây là token gốc, chưa dịch', 'color: #4ecdc4;');
      console.log('%c     → Translated tokens sẽ có translation_status = "translation"', 'color: #4ecdc4;');
    } else if (tokenData.translation_status === 'translation') {
      console.log('%c  ✅ SUCCESS: This is a TRANSLATED token!', 'color: lime; font-weight: bold;');
      console.log(`%c     → Translated to: ${tokenData.language}`, 'color: lime;');
    } else {
      console.log(`%c  ⚠️  UNEXPECTED: translation_status = "${tokenData.translation_status}"`, 'color: orange; font-weight: bold;');
    }
    
    console.log('');
    console.log('%c═══════════════════════════════════════', 'color: #ff6b6b; font-weight: bold;');
    
    tokenCaptured = true;
    
    // Restore original after 5 seconds
    setTimeout(() => {
      console.log = originalLog;
      console.log('%c✅ Debug script finished. console.log restored.', 'color: #bada55;');
    }, 5000);
  }
};

console.log = interceptor;

console.log('%c✅ Script active. Waiting for tokens...', 'color: #bada55;');
console.log('%c📝 Start streaming and speak to capture token data', 'color: #4ecdc4;');

