// DOM Elements
const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const toast = document.getElementById('toast');

// --- Tab Switching Logic ---
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        // Remove active class from all tabs and contents
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // Add active class to clicked tab and corresponding content
        tab.classList.add('active');
        const targetId = tab.getAttribute('data-tab');
        document.getElementById(targetId).classList.add('active');
    });
});

// --- Base Image Handling Class ---
class ImageHandler {
    constructor(type) {
        this.type = type; // 'notebook' or 'questionnaire'
        this.dropZone = document.getElementById(`drop-zone-${type}`);
        this.fileInput = document.getElementById(`file-input-${type}`);
        this.previewContainer = document.getElementById(`preview-container-${type}`);
        this.imagePreview = document.getElementById(`image-preview-${type}`);
        this.removeBtn = document.getElementById(`remove-btn-${type}`);
        this.analyzeBtn = document.getElementById(`analyze-btn-${type}`);
        
        this.currentFile = null;
        this.base64Data = null;

        this.initEventListeners();
    }

    initEventListeners() {
        // Drag and drop events
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('dragover');
        });

        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('dragover');
        });

        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                this.handleFile(e.dataTransfer.files[0]);
            }
        });

        // File input change
        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFile(e.target.files[0]);
            }
        });

        // Remove image
        this.removeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering file input click
            this.clearImage();
        });
    }

    handleFile(file) {
        // Check if file is an image
        if (!file.type.match('image.*')) {
            showToast('画像ファイル(JPEG/PNG)を選択してください');
            return;
        }

        this.currentFile = file;
        this.analyzeBtn.disabled = false;

        // Preview and Convert to Base64
        const reader = new FileReader();
        reader.onload = (e) => {
            this.imagePreview.src = e.target.result;
            this.previewContainer.style.display = 'flex';
            
            // Extract base64 without the data URL prefix
            this.base64Data = e.target.result.split(',')[1];
        };
        reader.readAsDataURL(file);
    }

    clearImage() {
        this.currentFile = null;
        this.base64Data = null;
        this.fileInput.value = '';
        this.previewContainer.style.display = 'none';
        this.imagePreview.src = '';
        this.analyzeBtn.disabled = true;
    }
    
    getBase64() {
        return this.base64Data;
    }
    
    getMimeType() {
        return this.currentFile ? this.currentFile.type : null;
    }
}

// --- Initialize Handlers ---
const notebookHandler = new ImageHandler('notebook');
const questionnaireHandler = new ImageHandler('questionnaire');

// --- Notebook Specific Logic ---
const resultTextNotebook = document.getElementById('result-text-notebook');
const copyBtnNotebook = document.getElementById('copy-btn-notebook');
const clearBtnNotebook = document.getElementById('clear-btn-notebook');
const loadingOverlayNotebook = document.getElementById('loading-overlay-notebook');

notebookHandler.analyzeBtn.addEventListener('click', async () => {
    if (!notebookHandler.getBase64()) return;

    // Show loading
    loadingOverlayNotebook.style.display = 'flex';
    notebookHandler.analyzeBtn.disabled = true;
    resultTextNotebook.value = '';
    copyBtnNotebook.disabled = true;
    clearBtnNotebook.disabled = true;

    try {
        // TODO: Replace with actual GAS API Call
        const gasUrl = document.getElementById('gas-url-input')?.value || localStorage.getItem('gasUrl');
        
        // Mock API Call Delay for demonstration
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        let extractedText = "";

        if(gasUrl) {
            // Actual API Call (Commented out until backend is ready)
             const payload = {
                 type: "notebook",
                 image: notebookHandler.getBase64(),
                 mimeType: notebookHandler.getMimeType()
             };
             
             const response = await fetch(gasUrl, {
                 method: 'POST',
                 body: JSON.stringify(payload),
                 // muteHttpExceptions: true equivalent handling in frontend? (handled by standard fetch)
             });
             
             if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
             const result = await response.json();
             
             if(result.status === "success" && result.data) {
                 extractedText = result.data;
             } else {
                 throw new Error(result.message || "Unknown API Error");
             }
        } else {
            // Mock Result
            extractedText = `ロキソプロフェンナトリウム錠60mg「EMEC」\nレバミピド錠100mg「オーハラ」\nセフジニルカプセル100mg「サワイ」`;
            if(gasUrl === "") {
                console.warn("GAS URL not set, using mock data for Notebook.");
            }
        }

        resultTextNotebook.value = extractedText;
        copyBtnNotebook.disabled = false;
        clearBtnNotebook.disabled = false;

    } catch (error) {
        console.error("Error analyzing notebook:", error);
        resultTextNotebook.value = `エラーが発生しました。\n詳細: ${error.message}\n\n※GASバックエンドのURLが正しく設定されているか確認してください。`;
    } finally {
        loadingOverlayNotebook.style.display = 'none';
        notebookHandler.analyzeBtn.disabled = false;
    }
});

copyBtnNotebook.addEventListener('click', () => {
    if (resultTextNotebook.value) {
        navigator.clipboard.writeText(resultTextNotebook.value)
            .then(() => showToast('クリップボードにコピーしました'))
            .catch(err => {
                console.error('Copy failed:', err);
                showToast('コピーに失敗しました');
            });
    }
});

clearBtnNotebook.addEventListener('click', () => {
    resultTextNotebook.value = '';
    copyBtnNotebook.disabled = true;
    clearBtnNotebook.disabled = true;
    notebookHandler.clearImage();
});


// --- Questionnaire Specific Logic ---
const loadingOverlayQuestionnaire = document.getElementById('loading-overlay-questionnaire');
const statusPanel = document.getElementById('status-panel-questionnaire');
const gasUrlInput = document.getElementById('gas-url-input');

// Load GAS URL from local storage
if (localStorage.getItem('gasUrl')) {
    gasUrlInput.value = localStorage.getItem('gasUrl');
}

// Save GAS URL to local storage on change
gasUrlInput.addEventListener('change', (e) => {
    localStorage.setItem('gasUrl', e.target.value.trim());
});

function setQuestionnaireStatus(status, data = null, errorMessage = null) {
    // Hide all statuses
    const views = statusPanel.children;
    for(let i=0; i<views.length; i++) {
        views[i].style.display = 'none';
    }

    if (status === 'idle') {
        statusPanel.querySelector('.status-idle').style.display = 'flex';
    } else if (status === 'loading') {
        loadingOverlayQuestionnaire.style.display = 'flex';
    } else if (status === 'success') {
        const successMsg = document.getElementById('success-message-questionnaire');
        successMsg.style.display = 'flex';
        // Format JSON payload for preview
        if(data) {
             document.getElementById('json-preview-questionnaire').textContent = JSON.stringify(data, null, 2);
        }
    } else if (status === 'error') {
        const errorMsg = document.getElementById('error-message-questionnaire');
        errorMsg.style.display = 'flex';
        document.getElementById('error-text-questionnaire').textContent = errorMessage || "不明なエラーが発生しました。";
    }
}

questionnaireHandler.analyzeBtn.addEventListener('click', async () => {
    if (!questionnaireHandler.getBase64()) return;
    
    const gasUrl = gasUrlInput.value.trim();
    if (!gasUrl) {
        showToast('GASのWebアプリURLを入力してください');
        gasUrlInput.focus();
        return;
    }

    setQuestionnaireStatus('loading');
    questionnaireHandler.analyzeBtn.disabled = true;

    try {
        const payload = {
            type: "questionnaire",
            image: questionnaireHandler.getBase64(),
            mimeType: questionnaireHandler.getMimeType()
        };

        const response = await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify(payload),
            // headers: { 'Content-Type': 'text/plain;charset=utf-8' } // GAS sometimes requires plain text to avoid CORS preflight, handled by stringify
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const result = await response.json();

        if (result.status === "success") {
            setQuestionnaireStatus('success', result.data);
        } else {
             throw new Error(result.message || "スプレッドシートへの保存に失敗しました。");
        }

    } catch (error) {
        console.error("Error processing questionnaire:", error);
        setQuestionnaireStatus('error', null, error.message);
    } finally {
        questionnaireHandler.analyzeBtn.disabled = false;
        // Optionally clear image after successful submission, but keeping it might be useful for verification
    }
});


// --- Utils ---
function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// OS Theme detection for initial load
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.body.setAttribute('data-theme', 'dark');
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    document.body.setAttribute('data-theme', e.matches ? 'dark' : 'light');
});
