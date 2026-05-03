// src/utils/parser.js

export const extractDeadlines = (rawText) => {
  // This is a basic parser. We will likely need to tweak this regex 
  // based on exactly how the FEeLS text copies over!
  
  const deadlines = [];
  const lines = rawText.split('\n');

  // Simple example: Assuming lines look like "15 May - Network Routing Lab"
  lines.forEach(line => {
    if (line.trim().length > 0) {
      deadlines.push(line.trim());
    }
  });

  return deadlines;
};

export const formatForClipboard = (deadlinesArray) => {
  if (deadlinesArray.length === 0) return "No deadlines found.";

  let message = "🚨 Upcoming Deadlines:\n\n";
  deadlinesArray.forEach(task => {
    message += `📌 ${task}\n`;
  });
  
  return message;
};