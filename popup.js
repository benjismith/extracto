// popup.js

document.addEventListener('DOMContentLoaded', function () {
    // Event listener for toggling selection mode
    document.getElementById('toggleSelectionBtn').addEventListener('click', () => {
        // Query the active tab in the current window
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab) {
                // Send message to the active tab's content script
                chrome.tabs.sendMessage(activeTab.id, { type: 'TOGGLE_SELECTION_MODE' }, response => {
                    if (chrome.runtime.lastError) {
                        // Handle errors (e.g., content script not injected)
                        showTemporaryMessage('Failed to toggle selection mode.', true);
                        return;
                    }
                    if (response && response.status) {
                        // Update button text based on selection mode state
                        const toggleButton = document.getElementById('toggleSelectionBtn');
                        toggleButton.textContent = response.active ? 'Deactivate Selection Mode' : 'Activate Selection Mode';
                        // Show a temporary success message in the UI
                        showTemporaryMessage('Selection mode toggled successfully!');
                    } else {
                        showTemporaryMessage('Failed to toggle selection mode.', true);
                    }
                });
            } else {
                showTemporaryMessage('No active tab to send message.', true);
            }
        });
    });

    // Event listener for exporting to clipboard
    document.getElementById('exportToClipboardBtn').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab) {
                // Send message to the active tab's content script to get the selected text
                chrome.tabs.sendMessage(activeTab.id, { type: 'EXPORT_TO_CLIPBOARD' }, response => {
                    if (chrome.runtime.lastError) {
                        // Handle errors (e.g., content script not injected)
                        showTemporaryMessage('Failed to export to clipboard.', true);
                        return;
                    }
                    if (response && response.text) {
                        const textToCopy = response.text;
                        if (textToCopy === "") {
                            showTemporaryMessage('No text selected to copy.', true);
                            return;
                        }
                        // Perform the clipboard write operation
                        navigator.clipboard.writeText(textToCopy).then(() => {
                            // Show a temporary success message in the UI
                            showTemporaryMessage('Exported to clipboard successfully!');
                            // Optionally, clear selections after copying
                            chrome.tabs.sendMessage(activeTab.id, { type: 'CLEAR_SELECTIONS' }, () => {});
                        }).catch(err => {
                            showTemporaryMessage('Failed to copy text to the clipboard.', true);
                        });
                    } else {
                        showTemporaryMessage('Failed to export to clipboard.', true);
                    }
                });
            } else {
                showTemporaryMessage('No active tab to send message.', true);
            }
        });
    });

    // Event listener for opening the archived page
    document.getElementById('openArchivedPageBtn').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab) {
                const originalURL = activeTab.url;
                try {
                    const urlObj = new URL(originalURL);
                    // Strip off hash and query parameters
                    urlObj.hash = '';
                    urlObj.search = '';
                    const strippedURL = urlObj.href;
                    // Construct the archived URL
                    const archivedURL = 'https://archive.is/' + strippedURL;
                    // Navigate to the archived URL in the same tab
                    chrome.tabs.update(activeTab.id, { url: archivedURL });
                } catch (error) {
                    showTemporaryMessage('Failed to open archived page. Invalid URL.', true);
                }
            } else {
                showTemporaryMessage('No active tab to open archived page.', true);
            }
        });
    });

    // Function to update the selection count in the UI
    function updateSelectionCount(count) {
        document.getElementById('selectionCount').textContent = `Selected: ${count}`;
    }

    // Request the initial selection count upon loading the popup
    chrome.runtime.sendMessage({ type: 'GET_SELECTION_COUNT' }, response => {
        if (response && response.count !== undefined) {
            updateSelectionCount(response.count);
        }
    });

    // Listen for updates to the selection count from the content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'UPDATE_SELECTION_COUNT') {
            updateSelectionCount(message.count);
        }
    });

    /**
     * Displays a temporary message in the popup for user feedback.
     * @param {string} message - The message to display.
     * @param {boolean} isError - Whether the message is an error (optional).
     */
    function showTemporaryMessage(message, isError = false) {
        const messageElement = document.getElementById('statusMessage');
        if (messageElement) {
            messageElement.textContent = message;
            messageElement.className = isError ? 'error' : 'success';
            messageElement.style.display = 'block';
            // Hide the message after 2 seconds
            setTimeout(() => {
                messageElement.style.display = 'none';
            }, 2000);
        }
    }
});
