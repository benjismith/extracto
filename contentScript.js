// contentScript.js

console.log("Extracto content script loaded."); // Verify script injection

let selectionModeActive = false;
let selectedElements = [];
let selectableElements = []; // Ordered list of selectable elements
let lastSelectedIndex = null; // Index of the last selected element

/**
 * Adds CSS styles for highlighting selected elements based on their tag.
 */
function addHighlightStyles() {
  const style = document.createElement('style');
  style.innerHTML = `
    .extracto-highlight-p {
      background-color: #ffff99 !important; /* Light Yellow for paragraphs and divs */
    }
    .extracto-highlight-h {
      background-color: #d1e7dd !important; /* Light Green for headers */
    }
    .extracto-highlight-blockquote {
      background-color: #f8d7da !important; /* Light Red for blockquotes */
    }
    .extracto-highlight-li-ul {
      background-color: #ffe0b2 !important; /* Light Orange for unordered list items */
    }
    .extracto-highlight-li-ol {
      background-color: #c5cae9 !important; /* Light Blue for ordered list items */
    }
    .extracto-highlight-hr {
      border: none;
      border-top: 2px dashed #999999;
      margin: 10px 0;
      height: 0; /* Ensure hr doesn't add extra height */
    }
  `;
  document.head.appendChild(style);
}

/**
 * Sends the current selection count to the popup.
 */
function sendSelectionCount() {
  const count = selectedElements.length;
  chrome.runtime.sendMessage({ type: "UPDATE_SELECTION_COUNT", count: count });
}

/**
 * Toggles the selection mode on or off.
 * When on, clicking specified elements will highlight them and store their references.
 */
function toggleSelectionMode() {
  selectionModeActive = !selectionModeActive;

  if (selectionModeActive) {
    console.log("Selection mode activated.");
    // Build the ordered list of selectable elements
    buildSelectableElementsList();
    document.addEventListener("click", handleElementClick, true);
    // Change cursor to indicate selection mode
    document.body.style.cursor = "crosshair";
  } else {
    console.log("Selection mode deactivated.");
    document.removeEventListener("click", handleElementClick, true);
    // Reset cursor
    document.body.style.cursor = "default";
    // Remove highlights when selection mode is deactivated
    clearAllSelections();
  }
}

/**
 * Builds an ordered list of all selectable elements on the page.
 */
function buildSelectableElementsList() {
  const selectableTags = [
    "p",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "hr",
    "li"
  ];

  // Use querySelectorAll to get all selectable elements in DOM order
  selectableElements = Array.from(document.querySelectorAll(selectableTags.join(',')));

  console.log(`Found ${selectableElements.length} selectable elements.`);
}

/**
 * Handles a click event on the document.
 * Supports both regular clicks and shift-clicks for range selection.
 */
function handleElementClick(event) {
  // Prevent default behavior to avoid unwanted actions
  event.preventDefault();
  event.stopPropagation();

  const target = event.target;

  // Define the tags that can be selected
  const selectableTags = [
    "p",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "hr",
    "li"
  ];

  /**
   * Finds the closest ancestor (including the element itself) that matches one of the selectable tags.
   * @param {Element} element - The starting element.
   * @param {Array<string>} tags - The list of tag names to match.
   * @returns {Element|null} - The matching ancestor element or null if none found.
   */
  function findSelectableAncestor(element, tags) {
    while (element && element !== document.body) {
      if (tags.includes(element.tagName.toLowerCase())) {
        return element;
      }
      element = element.parentElement;
    }
    return null;
  }

  // Find the nearest selectable ancestor
  const selectableElement = findSelectableAncestor(target, selectableTags);

  if (selectableElement) {
    // Find the index of the selectable element in the ordered list
    const currentIndex = selectableElements.indexOf(selectableElement);

    if (currentIndex === -1) {
      // Element not found in the list (shouldn't happen)
      console.warn("Selectable element not found in the list.");
      return;
    }

    if (event.shiftKey && lastSelectedIndex !== null) {
      // Shift-click detected, perform range selection
      const start = Math.min(lastSelectedIndex, currentIndex);
      const end = Math.max(lastSelectedIndex, currentIndex);

      console.log(`Selecting range from index ${start} to ${end}.`);

      for (let i = start; i <= end; i++) {
        const element = selectableElements[i];
        if (!selectedElements.includes(element)) {
          selectElement(element);
        }
      }
    } else {
      // Regular click, toggle selection of the clicked element
      if (selectedElements.includes(selectableElement)) {
        deselectElement(selectableElement);
      } else {
        selectElement(selectableElement);
      }
      // Update the last selected index
      lastSelectedIndex = currentIndex;
    }
  }
}

/**
 * Filters the selectedElements array to include only leaf elements,
 * excluding any elements that have selected descendants.
 * @returns {Array<Element>} - An array of leaf selected elements.
 */
function getLeafSelectedElements() {
  return selectedElements.filter(el =>
    !selectedElements.some(otherEl => otherEl !== el && otherEl.contains(el))
  );
}

/**
 * Determines the appropriate prefix for a list item based on its parent list type.
 * @param {Element} liElement - The <li> element.
 * @returns {string} - The prefix string.
 */
function getListItemPrefix(liElement) {
  const parent = liElement.parentElement;
  if (parent.tagName.toLowerCase() === 'ul') {
    return "* ";
  } else if (parent.tagName.toLowerCase() === 'ol') {
    // Get the index of the <li> within the <ol>
    const listItems = Array.from(parent.querySelectorAll('li'));
    const index = listItems.indexOf(liElement);
    return `${index + 1}. `;
  }
  return "";
}

/**
 * Processes the text within a blockquote element to ensure it's enclosed in curly quotes.
 * @param {string} text - The original text.
 * @returns {string} - The processed text.
 */
function processBlockquoteText(text) {
  const curlyQuotesPattern = /^“.*”$/;
  const straightQuotesPattern = /^".*"$/;

  if (curlyQuotesPattern.test(text)) {
    // Already enclosed in curly quotes
    return text;
  } else if (straightQuotesPattern.test(text)) {
    // Enclosed in straight quotes, convert to curly quotes
    return `“${text.slice(1, -1)}”`;
  } else {
    // Not quoted, add curly quotes
    return `“${text}”`;
  }
}

/**
 * Retrieves the processed text from an element, converting <br> tags to newlines,
 * normalizing whitespace by replacing unicode and non-breaking spaces with regular spaces,
 * removing zero-width spaces, replacing multiple spaces with a single space,
 * and trimming trailing spaces from each line.
 * @param {Element} el - The DOM element.
 * @returns {string} - The processed text.
 */
function getElementText(el) {
  if (el.tagName.toLowerCase() === 'hr') {
    // <hr> elements are handled separately
    return '';
  }

  let text = '';
  el.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName.toLowerCase() === 'br') {
        text += '\n';
      } else {
        text += getElementText(node);
      }
    }
  });

  // Normalize whitespace
  text = text
    // Replace unicode spaces and non-breaking spaces with regular space
    .replace(/[\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    // Remove zero-width spaces
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Replace multiple spaces with a single space
    .replace(/ {2,}/g, ' ')
    // Remove trailing spaces from each line
    .replace(/[ \t]+$/gm, '')
    // Trim leading and trailing whitespace from the entire text
    .trim();

  return text;
}

/**
 * Determines the appropriate page URL based on the current domain.
 * If on archive.is, extracts the URL from the input field named "q".
 * @returns {string} - The determined page URL.
 */
function getPageURL() {
  if (window.location.hostname === 'archive.is') {
    const qInput = document.querySelector('input[name="q"]');
    if (qInput && qInput.value.trim() !== '') {
      return qInput.value.trim();
    }
  }
  return window.location.href.trim();
}

/**
 * Selects an element: highlights it using CSS classes and stores its reference.
 * @param {Element} element - The element to select.
 */
function selectElement(element) {
  // Determine the appropriate CSS class based on the tag
  let highlightClass = "extracto-highlight-p"; // default for <p> and <div>

  if (element.tagName.toLowerCase().startsWith("h")) {
    highlightClass = "extracto-highlight-h"; // for headers
  } else if (element.tagName.toLowerCase() === "blockquote") {
    highlightClass = "extracto-highlight-blockquote"; // for blockquotes
  } else if (element.tagName.toLowerCase() === "li") {
    const parent = element.parentElement;
    if (parent.tagName.toLowerCase() === 'ul') {
      highlightClass = "extracto-highlight-li-ul"; // for unordered list items
    } else if (parent.tagName.toLowerCase() === 'ol') {
      highlightClass = "extracto-highlight-li-ol"; // for ordered list items
    }
  } else if (element.tagName.toLowerCase() === "hr") {
    highlightClass = "extracto-highlight-hr"; // for horizontal rules
  }

  // Add the CSS class to highlight the element
  element.classList.add(highlightClass);

  // Store the element reference
  selectedElements.push(element);
  console.log("Selected element:", element.tagName, element.textContent.trim());

  // Send updated selection count
  sendSelectionCount();
}

/**
 * Deselects an element: removes its highlight CSS class and removes its reference from storage.
 * @param {Element} element - The element to deselect.
 */
function deselectElement(element) {
  // Determine which CSS class to remove based on the tag
  let highlightClass = "extracto-highlight-p"; // default for <p> and <div>

  if (element.tagName.toLowerCase().startsWith("h")) {
    highlightClass = "extracto-highlight-h"; // for headers
  } else if (element.tagName.toLowerCase() === "blockquote") {
    highlightClass = "extracto-highlight-blockquote"; // for blockquotes
  } else if (element.tagName.toLowerCase() === "li") {
    const parent = element.parentElement;
    if (parent.tagName.toLowerCase() === 'ul') {
      highlightClass = "extracto-highlight-li-ul"; // for unordered list items
    } else if (parent.tagName.toLowerCase() === 'ol') {
      highlightClass = "extracto-highlight-li-ol"; // for ordered list items
    }
  } else if (element.tagName.toLowerCase() === "hr") {
    highlightClass = "extracto-highlight-hr"; // for horizontal rules
  }

  // Remove the CSS class to remove the highlight
  element.classList.remove(highlightClass);

  // Remove from selected elements
  selectedElements = selectedElements.filter(el => el !== element);

  console.log("Deselected element:", element.tagName, element.textContent.trim());

  // Send updated selection count
  sendSelectionCount();
}

/**
 * Clears all selections: removes highlights and resets storage arrays.
 */
function clearAllSelections() {
  selectedElements.forEach(el => {
    // Determine which CSS class to remove based on the tag
    let highlightClass = "extracto-highlight-p"; // default for <p> and <div>

    if (el.tagName.toLowerCase().startsWith("h")) {
      highlightClass = "extracto-highlight-h"; // for headers
    } else if (el.tagName.toLowerCase() === "blockquote") {
      highlightClass = "extracto-highlight-blockquote"; // for blockquotes
    } else if (el.tagName.toLowerCase() === "li") {
      const parent = el.parentElement;
      if (parent.tagName.toLowerCase() === 'ul') {
        highlightClass = "extracto-highlight-li-ul"; // for unordered list items
      } else if (parent.tagName.toLowerCase() === 'ol') {
        highlightClass = "extracto-highlight-li-ol"; // for ordered list items
      }
    } else if (el.tagName.toLowerCase() === "hr") {
      highlightClass = "extracto-highlight-hr"; // for horizontal rules
    }

    // Remove the CSS class to remove the highlight
    el.classList.remove(highlightClass);
  });
  selectedElements = [];
  lastSelectedIndex = null;
  console.log("All selections cleared.");

  // Send updated selection count
  sendSelectionCount();
}

/**
 * Creates a text string from the selected leaf items ordered by DOM sequence.
 * Skips any elements that are empty or contain only whitespace.
 * Converts <hr> elements to "***".
 * Formats <li> elements with appropriate prefixes.
 * Encloses blockquote texts in curly quotes.
 * Inserts the current page URL as the first line of the exported text.
 * @returns {string} - The combined text.
 */
function getSelectedTextForClipboard() {
  if (selectedElements.length === 0) {
    return ""; // No text selected, return empty string
  }

  // Get leaf selected elements
  const leafElements = getLeafSelectedElements();

  // Filter out elements with empty or whitespace-only text, except for <hr>
  const filteredElements = leafElements.filter(el => {
    if (el.tagName.toLowerCase() === 'hr') {
      // <hr> elements are handled regardless of their text content
      return true;
    }
    return getElementText(el) !== "";
  });

  if (filteredElements.length === 0) {
    return ""; // No valid text to copy, return empty string
  }

  // Get the appropriate page URL
  const pageURL = getPageURL();

  // Prepare the combined text with URL as the first line
  let combinedText = "";

  if (pageURL !== "") {
    combinedText += pageURL + "\n\n";
  }

  // Map elements to their processed text
  combinedText += filteredElements.map(el => {
    const tag = el.tagName.toLowerCase();

    if (tag === 'hr') {
      return '***';
    } else if (tag === 'li') {
      return getListItemPrefix(el) + getElementText(el);
    } else if (tag.startsWith('h')) {
      return getElementText(el); // Removed .toUpperCase()
    } else if (tag === 'blockquote') {
      return processBlockquoteText(getElementText(el));
    } else {
      // For <p> and <div>, return the processed text with <br> as newlines
      return getElementText(el);
    }
  }).join("\n\n");

  // Log the combined text for debugging
  console.log("Combined Text for Export to Clipboard:\n", combinedText);

  return combinedText;
}

/**
 * Copies the selected text to the clipboard.
 * Now handled by the popup, so this function is unused.
 */
function exportSelectedTextToClipboard(callback) {
  const textToCopy = getSelectedTextForClipboard();

  if (textToCopy === "") {
    // Nothing to copy, do nothing
    callback('No text selected to copy.');
    return;
  }

  // Use the Clipboard API to write text
  navigator.clipboard.writeText(textToCopy).then(() => {
    // Success
    clearAllSelections();
    callback('Text copied to clipboard successfully!');
  }).catch(err => {
    console.error("Failed to copy text to the clipboard:", err);
    callback('Failed to copy text to the clipboard.');
  });
}

/**
 * Handles messages from popup.js and other parts of the extension.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Received message:", message);
  if (message.type === "TOGGLE_SELECTION_MODE") {
    toggleSelectionMode();
    sendResponse({ status: "Selection mode toggled", active: selectionModeActive });
  } else if (message.type === "EXPORT_TO_CLIPBOARD") {
    // Instead of exporting directly, send the text back to the popup
    const text = getSelectedTextForClipboard();
    sendResponse({ text: text });
    // Clipboard write is handled by the popup
  } else if (message.type === "GET_SELECTED_TEXT") {
    const text = getSelectedTextForClipboard();
    sendResponse({ text: text });
  } else if (message.type === "GET_SELECTION_MODE") {
    sendResponse({ active: selectionModeActive });
  } else if (message.type === "GET_SELECTION_COUNT") {
    sendResponse({ count: selectedElements.length });
  } else if (message.type === "CLEAR_SELECTIONS") {
    clearAllSelections();
    sendResponse({ status: "Selections cleared" });
  }
});

/**
 * Observes DOM changes and updates the selectable elements list accordingly.
 */
function observeDOMChanges() {
  const observer = new MutationObserver((mutationsList) => {
    for (let mutation of mutationsList) {
      if (mutation.type === 'childList') {
        // Rebuild the selectable elements list to include new elements
        buildSelectableElementsList();
      }
    }
  });

  // Start observing the document body for changes
  observer.observe(document.body, { childList: true, subtree: true });

  console.log("MutationObserver has been set up to monitor DOM changes.");
}

// Initialize Mutation Observer and add highlight styles when the content script loads
addHighlightStyles();
observeDOMChanges();
