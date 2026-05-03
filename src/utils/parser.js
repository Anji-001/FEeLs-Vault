export const parseDeadlineString = (rawText) => {
  // 1. Extract Subject Code
  const subjectMatch = rawText.match(/(CO\d{3})/i);
  const subject = subjectMatch ? subjectMatch[1].toUpperCase() : "General";

  // 2. Extract Date and Time using a super-forgiving Regex
  // Hunts for: "6 May, 12:00 AM" ignoring weird commas or Moodle formatting
  const dateMatch = rawText.match(/(\d{1,2})\s+([A-Za-z]{3,9})[^0-9]*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  
  let formattedDeadline = "Unknown Date";
  let remaining = "Unknown";

  if (dateMatch) {
    // Break the Regex match into raw variables
    const day = parseInt(dateMatch[1], 10);
    const monthStr = dateMatch[2].substring(0, 3).toLowerCase();
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIndex = months.indexOf(monthStr);
    
    let hours = parseInt(dateMatch[3], 10);
    const minutes = parseInt(dateMatch[4], 10);
    const meridian = dateMatch[5].toUpperCase();

    // Convert to 24-hour time so the Android JS Engine doesn't crash
    if (meridian === 'PM' && hours < 12) hours += 12;
    if (meridian === 'AM' && hours === 12) hours = 0;

    // Build the date manually (100% safe across all devices)
    const currentYear = new Date().getFullYear();
    const parsedDate = new Date(currentYear, monthIndex, day, hours, minutes);

    if (!isNaN(parsedDate)) {
      // Format output exactly how you requested: "5/6/2026 12:00 AM" 
      const displayMinutes = minutes < 10 ? '0' + minutes : minutes;
      formattedDeadline = `${monthIndex + 1}/${day}/${currentYear} ${dateMatch[3]}:${displayMinutes} ${meridian}`;
      
      // Calculate Remaining Time
      const diffMs = parsedDate - new Date();

      if (diffMs < 0) {
        remaining = "Overdue 🚨";
      } else {
        const daysLeft = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hoursLeft = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        remaining = `${daysLeft} days ${hoursLeft} hours`;
      }
    }
  }

  // 3. Extract the Title/Description
  // Moodle adds massive paragraphs after "Course event". We split there and drop the rest!
  let description = rawText.split(/Course event/i)[0];
  
  // Wipe out the date string if we found it
  if (dateMatch) {
    description = description.replace(dateMatch[0], "");
  }

  // Clean up leftover words and weekdays
  description = description
    .replace(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?/ig, "")
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