/**
 * Ultra-Smooth Scroll-Based Frame Sequence Animation
 * Powers 600 high-resolution frames (frame_000001.jpg - frame_000600.jpg)
 * Features:
 * - Priority-queued smart buffering with zero network choking
 * - Zero-flicker nearest-frame fallback
 * - High-DPI / Retina responsive aspect-ratio cover rendering
 * - Dual-layer smoothing (Lenis Smooth Scroll + Sub-frame LERP)
 * - Traverses every frame smoothly across user scroll progress
 */

(() => {
  "use strict";

  const TOTAL_FRAMES = 600;
  const getFrameUrl = (index) =>
    `./frames/frame_${String(index + 1).padStart(6, "0")}.jpg`;

  // Canvas & Context Setup
  const canvas = document.getElementById("hero-lightpass");
  if (!canvas) {
    console.error("Canvas #hero-lightpass not found.");
    return;
  }
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });

  // DOM Elements
  const loaderEl = document.getElementById("frame-loader");
  const loaderPctEl = document.getElementById("loader-pct");

  // Animation & Frame Tracking
  const images = new Array(TOTAL_FRAMES).fill(null);
  // Status: 0 = unrequested, 1 = loading, 2 = loaded, 3 = error
  const loadStatus = new Uint8Array(TOTAL_FRAMES);

  let loadedCount = 0;
  let currentFrameFloat = 0;
  let targetFrameFloat = 0;
  let lastRenderedIndex = -1;
  let isInitialFrameDrawn = false;

  // Smoothing parameter (0.08 = very silky/fluid, 0.15 = snappier)
  const LERP_FACTOR = 0.12;

  // Concurrency controller for background preloading
  const MAX_CONCURRENT_LOADS = 6;
  let activeLoads = 0;
  const priorityQueue = [];
  const queuedSet = new Uint8Array(TOTAL_FRAMES);

  // --------------------------------------------------------------------------
  // 1. Responsive Canvas Sizing (Cover Math + Retina DPI)
  // --------------------------------------------------------------------------
  let canvasW = 0;
  let canvasH = 0;

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvasW = Math.round(window.innerWidth * dpr);
    canvasH = Math.round(window.innerHeight * dpr);

    if (canvas.width !== canvasW || canvas.height !== canvasH) {
      canvas.width = canvasW;
      canvas.height = canvasH;
    }

    // Re-render currently active frame at new resolution
    if (lastRenderedIndex >= 0) {
      renderFrame(lastRenderedIndex, true);
    }
  }

  window.addEventListener("resize", resizeCanvas, { passive: true });
  window.addEventListener("orientationchange", resizeCanvas, { passive: true });

  /**
   * Draw image scaled with 'cover' aspect ratio into canvas
   */
  function drawImageCover(img) {
    if (!img || !img.naturalWidth) return;
    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    const canvasRatio = cw / ch;
    const imgRatio = iw / ih;

    let dw, dh, dx, dy;

    if (canvasRatio > imgRatio) {
      dw = cw;
      dh = Math.ceil(cw / imgRatio);
      dx = 0;
      dy = Math.round((ch - dh) / 2);
    } else {
      dh = ch;
      dw = Math.ceil(ch * imgRatio);
      dx = Math.round((cw - dw) / 2);
      dy = 0;
    }

    ctx.drawImage(img, 0, 0, iw, ih, dx, dy, dw, dh);
  }

  // --------------------------------------------------------------------------
  // 2. High-Performance Frame Rendering & Nearest-Frame Fallback
  // --------------------------------------------------------------------------
  function findBestAvailableImage(index) {
    if (loadStatus[index] === 2 && images[index]) {
      return { img: images[index], index };
    }

    // Search outward for nearest loaded neighbor so canvas never goes blank
    for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
      const prev = index - offset;
      if (prev >= 0 && loadStatus[prev] === 2 && images[prev]) {
        return { img: images[prev], index: prev };
      }
      const next = index + offset;
      if (next < TOTAL_FRAMES && loadStatus[next] === 2 && images[next]) {
        return { img: images[next], index: next };
      }
    }

    return null;
  }

  function renderFrame(index, forceRedraw = false) {
    if (index === lastRenderedIndex && !forceRedraw) return;

    const result = findBestAvailableImage(index);
    if (result && result.img) {
      drawImageCover(result.img);
      lastRenderedIndex = index;
    }

    // Ensure current requested frame is queued at top priority if not loaded
    if (loadStatus[index] === 0) {
      prioritizeLoad(index);
    }
  }

  // --------------------------------------------------------------------------
  // 3. Priority Buffering Queue & Background Preloader
  // --------------------------------------------------------------------------
  function prioritizeLoad(index) {
    if (index < 0 || index >= TOTAL_FRAMES || loadStatus[index] !== 0) return;
    if (!queuedSet[index]) {
      queuedSet[index] = 1;
      priorityQueue.unshift(index); // Add to head of priority queue
      processQueue();
    }
  }

  function queueLoad(index) {
    if (index < 0 || index >= TOTAL_FRAMES || loadStatus[index] !== 0) return;
    if (!queuedSet[index]) {
      queuedSet[index] = 1;
      priorityQueue.push(index); // Add to tail
      processQueue();
    }
  }

  function processQueue() {
    while (activeLoads < MAX_CONCURRENT_LOADS && priorityQueue.length > 0) {
      const nextIndex = priorityQueue.shift();
      queuedSet[nextIndex] = 0;

      if (loadStatus[nextIndex] === 0) {
        startLoadingFrame(nextIndex);
      }
    }
  }

  function startLoadingFrame(index) {
    activeLoads++;
    loadStatus[index] = 1; // loading

    const img = new Image();
    img.decoding = "async";

    img.onload = () => {
      activeLoads--;
      loadStatus[index] = 2; // loaded
      images[index] = img;
      loadedCount++;

      // If this is the initial frame, draw immediately
      if (!isInitialFrameDrawn && index === 0) {
        isInitialFrameDrawn = true;
        resizeCanvas();
        renderFrame(0, true);
      } else if (Math.round(currentFrameFloat) === index) {
        // Redraw if the playhead is currently waiting for this exact frame
        renderFrame(index, true);
      }

      updateBufferProgress();
      processQueue();
    };

    img.onerror = () => {
      activeLoads--;
      loadStatus[index] = 3; // error
      console.warn(`Failed to load frame ${index + 1}: ${getFrameUrl(index)}`);
      processQueue();
    };

    img.src = getFrameUrl(index);
  }

  function updateBufferProgress() {
    const pct = Math.min(100, Math.round((loadedCount / TOTAL_FRAMES) * 100));
    if (loaderPctEl) {
      loaderPctEl.textContent = `${pct}%`;
    }

    // Dismiss loader once first 30 frames are ready for smooth scrolling
    if (
      loadedCount >= 30 &&
      loaderEl &&
      !loaderEl.classList.contains("loaded")
    ) {
      loaderEl.classList.add("loaded");
    }
  }

  // --------------------------------------------------------------------------
  // 4. Directional Buffering Window (Predictive Preloading)
  // --------------------------------------------------------------------------
  let lastScrollFraction = 0;

  function updateBufferingWindow(currentIndex) {
    const currentProgress = getScrollProgress();
    const isScrollingDown = currentProgress >= lastScrollFraction;
    lastScrollFraction = currentProgress;

    // 1. Immediately request the next 30 frames ahead in scroll direction
    const forwardLookahead = 30;
    const backwardLookahead = 15;

    if (isScrollingDown) {
      for (let i = 1; i <= forwardLookahead; i++) {
        prioritizeLoad(currentIndex + i);
      }
      for (let i = 1; i <= backwardLookahead; i++) {
        queueLoad(currentIndex - i);
      }
    } else {
      for (let i = 1; i <= forwardLookahead; i++) {
        prioritizeLoad(currentIndex - i);
      }
      for (let i = 1; i <= backwardLookahead; i++) {
        queueLoad(currentIndex + i);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 5. Scroll Progress & Smooth Physics (Sub-frame LERP)
  // --------------------------------------------------------------------------
  function getScrollProgress() {
    const docHeight =
      document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return 0;
    const scrollTop =
      window.scrollY ||
      window.pageYOffset ||
      document.documentElement.scrollTop ||
      0;
    return Math.max(0, Math.min(1, scrollTop / docHeight));
  }

  function updateScrollTarget() {
    const progress = getScrollProgress();
    // Accurately map 0.0 -> 1.0 to frame index 0 -> 599
    targetFrameFloat = progress * (TOTAL_FRAMES - 1);
    updateBufferingWindow(Math.round(targetFrameFloat));
  }

  window.addEventListener("scroll", updateScrollTarget, { passive: true });

  // --------------------------------------------------------------------------
  // 6. Lenis Smooth Scroll Integration (Fluid inertia scrolling)
  // --------------------------------------------------------------------------
  let lenis = null;

  function initSmoothScroll() {
    if (typeof window.Lenis !== "undefined") {
      lenis = new window.Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: "vertical",
        gestureOrientation: "vertical",
        smoothWheel: true,
        wheelMultiplier: 1.0,
        touchMultiplier: 1.2,
      });

      lenis.on("scroll", () => {
        updateScrollTarget();
      });
    }
  }

  // --------------------------------------------------------------------------
  // 7. Main Animation Loop (60fps/120fps RAF)
  // --------------------------------------------------------------------------
  function animate(time) {
    if (lenis) {
      lenis.raf(time);
    }

    // Sub-frame LERP calculation: smoothly floats towards target frame
    const diff = targetFrameFloat - currentFrameFloat;
    if (Math.abs(diff) > 0.001) {
      currentFrameFloat += diff * LERP_FACTOR;
    } else {
      currentFrameFloat = targetFrameFloat;
    }

    const frameToRender = Math.max(
      0,
      Math.min(TOTAL_FRAMES - 1, Math.round(currentFrameFloat)),
    );
    renderFrame(frameToRender);

    requestAnimationFrame(animate);
  }

  // --------------------------------------------------------------------------
  // 8. Navigation Active Underline & Scrollspy
  // --------------------------------------------------------------------------
  function initNavigation() {
    const navLinks = document.querySelectorAll(".nav-links a");
    const sections = document.querySelectorAll("section[id], footer[id]");

    navLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        const targetId = link.getAttribute("href");
        if (targetId && targetId.startsWith("#")) {
          e.preventDefault();
          navLinks.forEach((l) => l.classList.remove("active"));
          link.classList.add("active");

          const targetEl = document.querySelector(targetId);
          if (targetEl) {
            if (lenis) {
              lenis.scrollTo(targetEl, { offset: 0, duration: 1.2 });
            } else {
              targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }
        }
      });
    });

    function updateActiveNavOnScroll() {
      const scrollPos = window.scrollY + 250;

      sections.forEach((section) => {
        const top = section.offsetTop;
        const height = section.offsetHeight;
        const id = section.getAttribute("id");

        if (scrollPos >= top && scrollPos < top + height) {
          navLinks.forEach((link) => {
            if (link.getAttribute("href") === `#${id}`) {
              navLinks.forEach((l) => l.classList.remove("active"));
              link.classList.add("active");
            }
          });
        }
      });
    }

    window.addEventListener("scroll", updateActiveNavOnScroll, {
      passive: true,
    });
  }

  // --------------------------------------------------------------------------
  // 9. Project Horizontal Slider & Modal System
  // --------------------------------------------------------------------------
  function initProjectSliderAndModals() {
    // Slider Navigation
    const slider = document.getElementById("project-slider");
    const prevBtn = document.getElementById("proj-prev-btn");
    const nextBtn = document.getElementById("proj-next-btn");

    if (slider && prevBtn && nextBtn) {
      prevBtn.addEventListener("click", () => {
        slider.scrollBy({ left: -360, behavior: "smooth" });
      });
      nextBtn.addEventListener("click", () => {
        slider.scrollBy({ left: 360, behavior: "smooth" });
      });
    }

    // Modal Popup Overlay
    const modalOverlay = document.getElementById("project-modal");
    const modalBody = document.getElementById("modal-content-body");
    const modalCloseBtn = document.getElementById("modal-close-btn");

    const modalData = {
      "modal-mca": {
        title: "MCA — AI & ML",
        content: `
        <div class="modal-badge">
            <i class="fa-solid fa-graduation-cap"></i> MCA Overview
        </div>

        <div class="education-details">
            <div class="education-item">
                <i class="fa-solid fa-building-columns"></i>
                <div>
                    <strong>Degree</strong>
                    <span>Master of Computer Applications (MCA)</span>
                </div>
            </div>

            <div class="education-item">
                <i class="fa-solid fa-brain"></i>
                <div>
                    <strong>Specialization</strong>
                    <span>Artificial Intelligence & Machine Learning</span>
                </div>
            </div>

            <div class="education-item">
                <i class="fa-solid fa-university"></i>
                <div>
                    <strong>University</strong>
                    <span>Galgotias University</span>
                </div>
            </div>

            <div class="education-item">
                <i class="fa-solid fa-calendar-check"></i>
                <div>
                    <strong>Program</strong>
                    <span>Postgraduate — Computer Applications</span>
                </div>
            </div>

            <div class="education-item">
                <i class="fa-solid fa-code"></i>
                <div>
                    <strong>Core Focus</strong>
                    <span>Machine Learning, Deep Learning, AI & Real-World Applications</span>
                </div>
            </div>

            <div class="cgpa-box">
                <span>CGPA</span>
                <strong>7.82</strong>
                <small>Academic Performance</small>
            </div>
        </div>
    `,
      },
      "modal-certifications": {
        title: "Certifications",
        content: `
        <div class="modal-badge">
            <i class="fa-solid fa-certificate"></i> Certifications
        </div>

        <div class="cert-btns">

            <button class="btn btn-outline glass"
                onclick="openCertificate('images/google.png')">
                Generative AI - Google Cloud
            </button>

            <button class="btn btn-outline glass"
                onclick="openCertificate('images/microsoft.png')">
                Data Analyst - Microsoft
            </button>

            <button class="btn btn-outline glass"
                onclick="openCertificate('images/hcl.png')">
                Generative AI - GUVI HCL
            </button>

            <button class="btn btn-outline glass"
                onclick="openCertificate('images/cisco.png')">
                Cisco CCNA
            </button>

            <button class="btn btn-outline glass"
                onclick="openCertificate('images/intervision.png')">
                Student Volunteer - InterVision
            </button>

        </div>
    `,
      },
      "modal-about-astra": {
        title: "ASTRA — AI Voice Assistant (Theory & Architecture)",
        content: `
          <div class="modal-badge"><i class="fa-solid fa-brain"></i> Project Overview</div>
          <p><strong>ASTRA (Automated Speech & Task Recognition Assistant)</strong> is an advanced voice-controlled desktop assistant engineered in Python. It integrates real-time speech recognition, natural language processing, and OpenCV computer vision for biometrics.</p>
          <br/>
          <h4>Key Features & Architecture:</h4>
          <ul>
            <li>• <strong>Voice Command Execution:</strong> 20+ automated system controls including application launchers, web search, media control, and workspace shortcuts.</li>
            <li>• <strong>Computer Vision Biometrics:</strong> Real-time face detection & recognition using OpenCV for secure authentication.</li>
            <li>• <strong>Natural Speech Synthesis:</strong> Converts natural language text into speech responses via pyttsx3 offline TTS engine.</li>
          </ul>
        `,
      },
      "modal-spec-astra": {
        title: "ASTRA — Technical Specification",
        content: `
          <div class="modal-badge"><i class="fa-solid fa-sliders"></i> Technical Stack</div>
          <table class="modal-spec-table">
            <tr><td><strong>Language:</strong></td><td>Python 3.10+</td></tr>
            <tr><td><strong>Speech API:</strong></td><td>SpeechRecognition, PyAudio</td></tr>
            <tr><td><strong>TTS Engine:</strong></td><td>pyttsx3</td></tr>
            <tr><td><strong>Vision Engine:</strong></td><td>OpenCV (cv2), face_recognition</td></tr>
            <tr><td><strong>Automation:</strong></td><td>OS, Subprocess, PyAutoGUI</td></tr>
            <tr><td><strong>Architecture:</strong></td><td>Multi-threaded listener pipeline</td></tr>
          </table>
        `,
      },
      "modal-about-invoice": {
        title: "Invoice Intelligence — Theory & Architecture",
        content: `
          <div class="modal-badge"><i class="fa-solid fa-file-invoice"></i> Project Overview</div>
          <p><strong>Invoice Intelligence</strong> is a Machine Learning-based application designed to analyze invoice data, identify potentially risky invoices, and predict freight costs using historical business data.</p>
          <br>
          <h4>Key Features & Architecture:</h4>
          <ul>
            <li>• <strong>OCR & Text Extraction:</strong> Extracts line items, vendor names, dates, sub-totals, tax amounts, and invoice totals.</li>
            <li>• <strong>ML Categorization:</strong> Automatically tags expenses into accounting categories (Logistics, Office Supplies, Software, etc.).</li>
            <li>• <strong>Interactive Analytics:</strong> Built with Streamlit for uploading invoices and visualizing financial analytics in real-time.</li>
          </ul>
        `,
      },
      "modal-spec-invoice": {
        title: "Invoice Intelligence — Technical Specification",
        content: `
          <div class="modal-badge"><i class="fa-solid fa-sliders"></i> Technical Stack</div>
          <table class="modal-spec-table">
            <tr><td><strong>Primary Tech:</strong></td><td>Python, Streamlit</td></tr>
            <tr><td><strong>OCR Engine:</strong></td><td>Tesseract OCR / EasyOCR</td></tr>
            <tr><td><strong>Data Processing:</strong></td><td>Pandas, NumPy, Scikit-learn</td></tr>
            <tr><td><strong>PDF Processing:</strong></td><td>PyPDF2, pdf2image, OpenCV</td></tr>
            <tr><td><strong>Deployment:</strong></td><td>Streamlit Community Cloud</td></tr>
          </table>
        `,
      },
      "modal-about-churn": {
        title: "Customer Churn Prediction — Theory & Architecture",
        content: `
          <div class="modal-badge"><i class="fa-solid fa-users"></i> Project Overview</div>
          <p><strong>Bank Customer Churn Prediction</strong> is a predictive machine learning platform built for financial institutions to identify customers at high risk of closing their accounts before churn happens.</p>
          <br>
          <h4>Key Features & Architecture:</h4>
          <ul>
            <li>• <strong>Ensemble ML Model:</strong> Achieves 90%+ classification accuracy using XGBoost and Random Forest.</li>
            <li>• <strong>Feature Importance:</strong> Analyzes key drivers like account balance, tenure, product count, and activity level.</li>
            <li>• <strong>Risk Predictor Dashboard:</strong> Interactive Web app allowing analysts to test customer metrics and receive instant risk scores.</li>
          </ul>
        `,
      },
      "modal-spec-churn": {
        title: "Customer Churn Prediction — Technical Specification",
        content: `
          <div class="modal-badge"><i class="fa-solid fa-sliders"></i> Technical Stack</div>
          <table class="modal-spec-table">
            <tr><td><strong>ML Models:</strong></td><td>XGBoost, Random Forest, Logistic Regression</td></tr>
            <tr><td><strong>Sampling & Scaling:</strong></td><td>SMOTE, StandardScaler, OneHotEncoder</td></tr>
            <tr><td><strong>Evaluation:</strong></td><td>ROC-AUC Score: 0.92+, Precision, Recall</td></tr>
            <tr><td><strong>Web UI:</strong></td><td>Streamlit, Plotly, Seaborn</td></tr>
            <tr><td><strong>Deployment:</strong></td><td>Streamlit Community Cloud</td></tr>
          </table>
        `,
      },
      "modal-about-sentiment": {
        title: "Sentiment Analysis — Theory & Architecture",
        content: `
          <div class="modal-badge"><i class="fa-solid fa-comments"></i> Project Overview</div>
          <p><strong>Sentiment Analysis ML System</strong> is an NLP application engineered to classify customer feedback, product reviews, and social media text into Positive, Negative, or Neutral sentiment categories.</p>
          <br>
          <h4>Key Features & Architecture:</h4>
          <ul>
            <li>• <strong>Real-time NLP Classification:</strong> Computes instant sentiment polarity scores for text inputs and dataset files.</li>
            <li>• <strong>Text Preprocessing:</strong> Tokenization, lemmatization, stop-word filtering, and TF-IDF feature extraction.</li>
            <li>• <strong>Visual Dashboards:</strong> Interactive WordClouds, sentiment distributions, and confidence metrics.</li>
          </ul>
        `,
      },
      "modal-spec-sentiment": {
        title: "Sentiment Analysis — Technical Specification",
        content: `
          <div class="modal-badge"><i class="fa-solid fa-sliders"></i> Technical Stack</div>
          <table class="modal-spec-table">
            <tr><td><strong>NLP Pipeline:</strong></td><td>NLTK, SpaCy, TextBlob</td></tr>
            <tr><td><strong>Feature Extraction:</strong></td><td>TF-IDF Vectorization, N-grams</td></tr>
            <tr><td><strong>Classifiers:</strong></td><td>Naive Bayes, SVM, Logistic Regression</td></tr>
            <tr><td><strong>Visualization:</strong></td><td>WordCloud, Plotly Express</td></tr>
            <tr><td><strong>Deployment:</strong></td><td>Streamlit Community Cloud</td></tr>
          </table>
        `,
      },
      "modal-about-heart": {
        title: "Heart Health Prediction — Theory & Architecture",
        content: `
          <div class="modal-badge"><i class="fa-solid fa-heart-pulse"></i> Project Overview</div>
          <p><strong>Heart Health Prediction</strong> is an end-to-end machine learning system engineered to predict cardiovascular disease risk. Trained on <strong>10,000+</strong> real-world healthcare records, the model leverages multiple clinical and lifestyle indicators to classify patients into risk categories — empowering early detection and preventive care.</p>
          <br>
          <h4>Key Features & Architecture:</h4>
          <ul>
            <li>• <strong>Heart Disease Risk Classification</strong> </li>
            <li>• <strong>Multi-Factor Feature Space</strong> </li>
            <li>• <strong>Data Preprocessing Pipeline</strong> </li>
            <li>• <strong>Model Evaluation Suite</strong> 
            <li>• <strong>Interactive Streamlit App</strong> </li>
          </ul>
        `,
      },
      "modal-spec-heart": {
        title: "Heart Health Prediction — Technical Specification",
        content: `
          <div class="modal-badge"><i class="fa-solid fa-sliders"></i> Technical Stack</div>
          <table class="modal-spec-table">
            <tr><td><strong>Language:</strong></td><td>Python 3.10+</td></tr>
            <tr><td><strong>ML Models:</strong></td><td>Random Forest, Logistic Regression, Gradient Boosting, XGBoost</td></tr>
            <tr><td><strong>Data Processing:</strong></td><td>Pandas, NumPy, Scikit-learn</td></tr>
            <tr><td><strong>Feature Engineering:</strong></td><td>StandardScaler, LabelEncoder, SMOTE</td></tr>
            <tr><td><strong>Evaluation Metrics:</strong></td><td>Accuracy, Precision, Recall, F1-Score, ROC-AUC</td></tr>
            <tr><td><strong>Dataset Size:</strong></td><td>10,000+ patient healthcare records</td></tr>
            <tr><td><strong>Visualization:</strong></td><td>Matplotlib, Seaborn, Plotly</td></tr>
            <tr><td><strong>Web UI:</strong></td><td>Streamlit</td></tr>
            <tr><td><strong>Deployment:</strong></td><td>Streamlit Community Cloud</td></tr>
          </table>
        `,
      },
      "modal-about-echo": {
        title: "Echo Site — Theory & Architecture",
        content: `
          <div class="modal-badge"><i class="fa-solid fa-microphone"></i> Project Overview</div>
          <p><strong>ECHO</strong> is a <strong>Blind Alphabet Trainer</strong> — a web-based accessibility tool designed to make alphabet typing practice more engaging and effective through voice-based interaction. Instead of simply displaying a letter on screen, ECHO creates an immersive audio-driven practice environment.</p>
          <br>
          <h4>Key Features & Architecture:</h4>
          <ul>
            <li>• <strong>🎙️ Voice-Based Training:</strong> Users hear the target letter spoken aloud via the Web Speech API and type the corresponding key.</li>
            <li>• <strong>⚡ Instant Audio Feedback:</strong> Real-time correct/incorrect audio and visual cues on every keystroke.</li>
            <li>• <strong>📊 Accuracy Monitoring:</strong> Live accuracy percentage tracking across entire practice sessions.</li>
        `,
      },
      "modal-spec-echo": {
        title: "Echo Site — Technical Specification",
        content: `
          <div class="modal-badge"><i class="fa-solid fa-sliders"></i> Technical Stack</div>
          <table class="modal-spec-table">
            <tr><td><strong>Frontend:</strong></td><td>HTML5, CSS3, Vanilla JavaScript</td></tr>
            <tr><td><strong>Audio Engine:</strong></td><td>Web Speech API (SpeechSynthesis)</td></tr>
            <tr><td><strong>Input System:</strong></td><td>Keyboard Event Listeners (keydown)</td></tr>
            <tr><td><strong>State Management:</strong></td><td>LocalStorage for session persistence</td></tr>
            <tr><td><strong>Analytics Engine:</strong></td><td>Custom accuracy, streak & weak-char tracking</td></tr>
            <tr><td><strong>Export Formats:</strong></td><td>JSON & CSV performance data export</td></tr>
            <tr><td><strong>Design:</strong></td><td>Responsive, mobile-friendly layout</td></tr>
            <tr><td><strong>Deployment:</strong></td><td>GitHub Pages (Static Hosting)</td></tr>
          </table>
        `,
      },
    };

    document.querySelectorAll("[data-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const modalId = btn.getAttribute("data-modal");
        const data = modalData[modalId];
        if (data && modalOverlay && modalBody) {
          modalBody.innerHTML = `
            <h2>${data.title}</h2>
            <div class="modal-text">${data.content}</div>
          `;
          modalOverlay.classList.add("active");
        }
      });
    });

    if (modalCloseBtn && modalOverlay) {
      modalCloseBtn.addEventListener("click", () => {
        modalOverlay.classList.remove("active");
      });
      modalOverlay.addEventListener("click", (e) => {
        if (e.target === modalOverlay) {
          modalOverlay.classList.remove("active");
        }
      });
      // Add click listeners for project and skill cards to scroll to respective sections
      const projectsCard = document.getElementById("projects-card");
      const skillsCard = document.getElementById("skills-card");
      if (projectsCard) {
        projectsCard.addEventListener("click", () => {
          const target = document.getElementById("projects");
          if (target) {
            if (lenis) {
              lenis.scrollTo(target, { offset: 0, duration: 1.2 });
            } else {
              target.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }
        });
      }
      if (skillsCard) {
        skillsCard.addEventListener("click", () => {
          const target = document.getElementById("skills");
          if (target) {
            if (lenis) {
              lenis.scrollTo(target, { offset: 0, duration: 1.2 });
            } else {
              target.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 10. Bootstrap Sequence
  // --------------------------------------------------------------------------
  function init() {
    resizeCanvas();
    initSmoothScroll();
    initNavigation();
    initProjectSliderAndModals();
    initContactForm();

    // Step 1: Load frame 0 immediately (first view)
    startLoadingFrame(0);

    // Step 2: Pre-buffer anchor frames across the entire 600-frame sequence (every 15th frame)
    // Ensures crisp anchor frames are ready at any scroll position
    for (let i = 15; i < TOTAL_FRAMES; i += 15) {
      queueLoad(i);
    }

    // Step 3: Pre-buffer the initial sequence (frames 1 to 40)
    for (let i = 1; i <= 40; i++) {
      queueLoad(i);
    }

    // Step 4: Progressively queue remaining frames in background until all 600 are loaded
    for (let i = 1; i < TOTAL_FRAMES; i++) {
      queueLoad(i);
    }

    // Step 5: Initial target calculation & start RAF loop
    updateScrollTarget();
    requestAnimationFrame(animate);
  }

  // Run as soon as DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

// --------------------------------------------------------------------------
// Global Functions: Certificate Preview & Contact Form Modal
// --------------------------------------------------------------------------
const GOOGLE_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdWVWz3e-3A3MUkPUCB0XjNsYImjpxD4eVM4JOAP8s8HN8eNA/formResponse";

function openContactForm() {
  const modal = document.getElementById("contact-form-modal");
  if (modal) {
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  }
}

function closeContactForm() {
  const modal = document.getElementById("contact-form-modal");
  if (modal) {
    modal.classList.remove("active");
    document.body.style.overflow = "";
  }
}

function initContactForm() {
  const modal = document.getElementById("contact-form-modal");
  const closeBtn = document.getElementById("cf-close-btn");
  const form = document.getElementById("contact-form");
  const successDiv = document.getElementById("cf-success");
  const sendAnotherBtn = document.getElementById("cf-send-another");
  const errorBanner = document.getElementById("cf-error-banner");

  if (closeBtn) {
    closeBtn.addEventListener("click", closeContactForm);
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeContactForm();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && modal.classList.contains("active")) {
      closeContactForm();
    }
  });

  if (sendAnotherBtn) {
    sendAnotherBtn.addEventListener("click", () => {
      if (successDiv) successDiv.style.display = "none";
      if (errorBanner) errorBanner.style.display = "none";
      if (form) {
        form.reset();
        form.style.display = "block";
      }
    });
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const nameErr = document.getElementById("cf-name-err");
      const emailErr = document.getElementById("cf-email-err");
      const fieldName = document.getElementById("cf-field-name");
      const fieldEmail = document.getElementById("cf-field-email");

      if (nameErr) nameErr.textContent = "";
      if (emailErr) emailErr.textContent = "";
      if (fieldName) fieldName.classList.remove("error");
      if (fieldEmail) fieldEmail.classList.remove("error");
      if (errorBanner) errorBanner.style.display = "none";

      const nameInput = document.getElementById("cf-name");
      const emailInput = document.getElementById("cf-email");
      const nameVal = nameInput ? nameInput.value.trim() : "";
      const emailVal = emailInput ? emailInput.value.trim() : "";
      let isValid = true;

      if (!nameVal) {
        if (nameErr) nameErr.textContent = "Please enter your name.";
        if (fieldName) fieldName.classList.add("error");
        isValid = false;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailVal || !emailRegex.test(emailVal)) {
        if (emailErr) emailErr.textContent = "Please enter a valid email address.";
        if (fieldEmail) fieldEmail.classList.add("error");
        isValid = false;
      }

      if (!isValid) return;

      const submitBtn = document.getElementById("cf-submit-btn");
      const btnText = document.getElementById("cf-btn-text");
      const btnLoading = document.getElementById("cf-btn-loading");

      if (submitBtn) submitBtn.disabled = true;
      if (btnText) btnText.style.display = "none";
      if (btnLoading) btnLoading.style.display = "inline-block";

      const phoneInput = document.getElementById("cf-phone");
      const companyInput = document.getElementById("cf-company");
      const roleSelect = document.getElementById("cf-role");
      const discussSelect = document.getElementById("cf-discuss");
      const messageInput = document.getElementById("cf-message");

      const params = new URLSearchParams();
      params.append("entry.2005620554", nameVal);
      params.append("entry.1045781291", emailVal);
      params.append("entry.1166974658", phoneInput ? phoneInput.value.trim() : "");
      params.append("entry.267083711", companyInput ? companyInput.value.trim() : "");
      params.append("entry.896273472", roleSelect ? roleSelect.value : "");
      params.append("entry.653703380", discussSelect ? discussSelect.value : "");
      params.append("entry.805918459", messageInput ? messageInput.value.trim() : "");

      fetch(GOOGLE_FORM_URL, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      })
        .then(() => {
          form.style.display = "none";
          if (successDiv) successDiv.style.display = "block";
          form.reset();
        })
        .catch((err) => {
          console.error("Form submit error:", err);
          if (errorBanner) {
            errorBanner.style.display = "flex";
          }
        })
        .finally(() => {
          if (submitBtn) submitBtn.disabled = false;
          if (btnText) btnText.style.display = "inline-block";
          if (btnLoading) btnLoading.style.display = "none";
        });
    });
  }
}

function openCertificate(imagePath) {
  const preview = document.createElement("div");

  preview.className = "certificate-preview";

  preview.innerHTML = `
        <div class="certificate-container">
            <button class="certificate-close">&times;</button>
            <img src="${imagePath}" alt="Certificate">
        </div>
    `;

  document.body.appendChild(preview);

  preview.querySelector(".certificate-close").onclick = () => {
    preview.remove();
  };

  preview.onclick = (event) => {
    if (event.target === preview) {
      preview.remove();
    }
  };
}
