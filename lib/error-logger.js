import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'error-log.json');
const MAX_LOGS = 100; // Keep last 100 errors

export function logError(context, error, metadata = {}) {
  const errorEntry = {
    timestamp: new Date().toISOString(),
    context,
    error: {
      message: error?.message || String(error),
      stack: error?.stack,
      code: error?.code
    },
    metadata,
    url: metadata.url || 'N/A',
    method: metadata.method || 'N/A'
  };

  // Console log for immediate visibility
  console.error(`❌ [${context}]`, error);
  console.error('📋 Metadata:', metadata);

  try {
    // Read existing logs
    let logs = [];
    if (fs.existsSync(LOG_FILE)) {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      logs = JSON.parse(content);
    }

    // Add new log
    logs.unshift(errorEntry);

    // Keep only last MAX_LOGS entries
    logs = logs.slice(0, MAX_LOGS);

    // Write back
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
  } catch (fileError) {
    console.error('Failed to write to error log:', fileError);
  }

  return errorEntry;
}

export function getRecentErrors(limit = 20) {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return [];
    }
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const logs = JSON.parse(content);
    return logs.slice(0, limit);
  } catch (error) {
    console.error('Failed to read error log:', error);
    return [];
  }
}

export function clearErrorLog() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      fs.unlinkSync(LOG_FILE);
    }
    return true;
  } catch (error) {
    console.error('Failed to clear error log:', error);
    return false;
  }
}
