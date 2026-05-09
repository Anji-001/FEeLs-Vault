export const parseDeadlineString = (rawText) => {
  const subjectMatch = rawText.match(/\b([A-Z]{2,4}\d{3})\b/i);
  const subject = subjectMatch ? subjectMatch[1].toUpperCase() : "General";

  let formattedDeadline = "Unknown Date";
  let remaining = "Unknown";
  let parsedDate = null;
  let dateMatchText = "";

  // ✨ NEW: Hunt for Moodle's relative dates ("Today, 12:00 AM" or "Tomorrow, 11:59 PM")
  const relativeMatch = rawText.match(/(Today|Tomorrow)[^0-9]*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  
  // ✨ STRICTER: Only matches real months so it ignores "1 Submission"
  const strictMatch = rawText.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s*(\d{4}))?[^0-9]*(\d{1,2}):(\d{2})\s*(AM|PM)/i);

  if (relativeMatch) {
    dateMatchText = relativeMatch[0];
    const isTomorrow = relativeMatch[1].toLowerCase() === 'tomorrow';
    let hours = parseInt(relativeMatch[2], 10);
    const minutes = parseInt(relativeMatch[3], 10);
    const meridian = relativeMatch[4].toUpperCase();

    if (meridian === 'PM' && hours < 12) hours += 12;
    if (meridian === 'AM' && hours === 12) hours = 0;

    const now = new Date();
    parsedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    
    // Add 24 hours if Moodle says "Tomorrow"
    if (isTomorrow) parsedDate.setDate(parsedDate.getDate() + 1);

  } else if (strictMatch) {
    dateMatchText = strictMatch[0];
    const day = parseInt(strictMatch[1], 10);
    const monthStr = strictMatch[2].toLowerCase();
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIndex = months.indexOf(monthStr);
    const targetYear = strictMatch[3] ? parseInt(strictMatch[3], 10) : new Date().getFullYear();
    
    let hours = parseInt(strictMatch[4], 10);
    const minutes = parseInt(strictMatch[5], 10);
    const meridian = strictMatch[6].toUpperCase();

    if (meridian === 'PM' && hours < 12) hours += 12;
    if (meridian === 'AM' && hours === 12) hours = 0;

    parsedDate = new Date(targetYear, monthIndex, day, hours, minutes);
  }

  // Calculate times if we successfully found a date
  if (parsedDate && !isNaN(parsedDate)) {
    const displayMinutes = parsedDate.getMinutes() < 10 ? '0' + parsedDate.getMinutes() : parsedDate.getMinutes();
    const ampm = parsedDate.getHours() >= 12 ? 'PM' : 'AM';
    let dispHours = parsedDate.getHours() % 12;
    dispHours = dispHours ? dispHours : 12;

    formattedDeadline = `${parsedDate.getMonth() + 1}/${parsedDate.getDate()}/${parsedDate.getFullYear()} ${dispHours}:${displayMinutes} ${ampm}`;
    
    const diffMs = parsedDate - new Date();
    if (diffMs < 0) {
      remaining = "Overdue 🚨";
    } else {
      const daysLeft = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hoursLeft = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      remaining = `${daysLeft} days ${hoursLeft} hours`;
    }
  }

  // Clean up the description
  let description = rawText.split(/Course event/i)[0];
  if (dateMatchText) description = description.replace(dateMatchText, "");
  
  description = description
    .replace(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Today|Tomorrow),?/ig, "")
    .replace(/is due/ig, "")
    .replace(/opens/ig, "- Opens")
    .replace(/closes/ig, "- Closes")
    .trim();

  return {
    subject,
    description: description || "Untitled Task",
    deadline: formattedDeadline,
    remaining
  };
};