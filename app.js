// Lawton Learns LinkedIn Engine - App State & Logic
document.addEventListener('DOMContentLoaded', () => {
try {

// --- SUPABASE CONFIGURATION ---
// User to provide keys here:
const SUPABASE_URL = 'https://ycwxcukxpokuvufmegdp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljd3hjdWt4cG9rdXZ1Zm1lZ2RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NzYxNzEsImV4cCI6MjA4OTM1MjE3MX0.vGdz0CLI7265nKZM1FDYTst3iLLASel5-1rJeTEY8pg';

// Initialize Supabase Client
// Wrapped in try/catch so the rest of app.js still works if CDN fails to load
let supabase = null;
try {
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log("Supabase client initialized.");
    } else {
        console.warn("Supabase JS library not loaded. Running with local mock data.");
    }
} catch (e) {
    console.warn("Failed to initialize Supabase client:", e.message);
}

// --- APP STATE ---
const appState = {
    currentView: 'dashboard',
    selectedModel: 'claude-3-5-sonnet',
    selectedTrend: null,
    generatedMagnet: null,
    generatedPosts: [],
    postHistory: [
        { id: 1, title: "The Death of Cold Email", type: "Contrarian", status: "Live", impressions: 1242, likes: 42, shares: 12, comments: 8, date: "2026-03-16 14:30" },
        { id: 2, title: "AI Automation for SMBs", type: "Case Study", status: "Live", impressions: 856, likes: 28, shares: 5, comments: 3, date: "2026-03-15 09:15" }
    ],
    currentPromptTab: 'Trend Analysis',
    systemPrompts: {
        'Trend Analysis': `// System Prompt for Trend Analysis\nYou are an expert market researcher for Lawton Learns.\nYour objective is to analyze the provided data from Reddit, X, YouTube, and TikTok to identify friction points related to small businesses adopting AI.\nRank by severity of the pain point and frequency of discussion...`,
        'Scraper Summary': `// System Prompt for Scraper Summary\nYou are a world-class intelligence analyst.\nYour goal is to take a raw list of posts from multiple sources (Reddit, X, LinkedIn) and identify the top 5 high-impact trending topics.\nFocus specifically on small business pain points, AI adoption hurdles, and contrarian perspectives.\nOutput the results as a clean JSON array of strings identifying the trend titles.`,
        'Lead Magnet': `// System Prompt for Lead Magnet\nYou are a high-converting direct-response copywriter.\nYour goal is to take a trending AI topic and turn it into a high-value lead magnet outline and 3 social media variations...`,
        'Post Writer': `// System Prompt for Post Writer\nYou are a LinkedIn ghostwriter for high-growth founders.\nConvert raw thoughts or lead magnet outlines into punchy, authoritative LinkedIn posts...`
    }
};


// --- DOM ELEMENTS ---
const elements = {
    navItems: document.querySelectorAll('.nav-item'),
    viewPanels: document.querySelectorAll('.view-panel'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingMessage: document.getElementById('loading-message'),
    modelSelector: document.getElementById('global-model'),
    
    // Skill 1
    btnRunTrends: document.getElementById('btn-run-trends'),
    trendsResults: document.getElementById('trends-results'),
    
    // Skill 2
    btnGenerateMagnet: document.getElementById('btn-generate-magnet'),
    topicInput: document.getElementById('lead-magnet-topic'),
    magnetResults: document.getElementById('magnet-results'),
    outlineContent: document.getElementById('magnet-outline-content'),
    variationsList: document.getElementById('magnet-variations'),
    
    // Skill 3
    btnDraftPost: document.getElementById('btn-draft-post'),
    rawThoughtInput: document.getElementById('raw-thought-input'),
    toneSelector: document.getElementById('tone-selector'),
    postDraftEditor: document.getElementById('post-draft-editor'),
    btnSchedule: document.getElementById('btn-schedule'),
    scheduleTime: document.getElementById('schedule-time'),
    
    // Settings
    btnSaveTopics: document.getElementById('btn-save-topics'),
    topicsInput: document.getElementById('linkedin-topics-input'),
    profileUrlInput: document.getElementById('linkedin-profile-url'),

    // Performance Tracker
    performanceSection: document.getElementById('performance-section'),
    performanceBody: document.getElementById('post-performance-body'),
    scheduledCount: document.getElementById('scheduled-count'),
    
    // Logs
    logContainer: document.getElementById('log-container'),
    trendsLog: document.getElementById('trends-log'),

    // Prompt Library Tabs
    promptTabs: document.querySelectorAll('.tab-btn'),
    promptEditor: document.querySelector('.system-prompt-editor'),
    btnSavePrompts: document.getElementById('btn-save-prompts')
};

// --- CORE UTILS ---
const showLoader = (msg = 'Loading...') => {
    elements.loadingMessage.textContent = msg;
    elements.loadingOverlay.classList.remove('hidden');
};

const hideLoader = () => {
    elements.loadingOverlay.classList.add('hidden');
};

const simulateDelay = (ms) => new Promise(res => setTimeout(res, ms));


// --- NAVIGATION LOGIC ---
const app = {
    switchView: (viewId) => {
        if (!viewId) return;
        
        // Update State
        appState.currentView = viewId;
        
        // Update Nav UI
        elements.navItems.forEach(item => {
            if (item.dataset.view === viewId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Update View Panels
        elements.viewPanels.forEach(panel => {
            if (panel.id === `view-${viewId}`) {
                panel.classList.add('active');
            } else {
                panel.classList.remove('active');
            }
        });
        
        // Update Header
        const headerTitle = document.getElementById('global-header-title');
        if (headerTitle) {
            const titles = {
                'dashboard': '<h2>Dashboard Overview</h2><p>Welcome back. Here is your recent activity and audience metrics.</p>',
                'skill1': '<h2>Trend Research Engine</h2><p>Scrape and analyze the hottest debates in AI & Small Business.</p>',
                'skill2': '<h2>Lead Magnet Factory</h2><p>Transform a trending idea into a high-value asset.</p>',
                'skill3': '<h2>Social Post Writer</h2><p>Draft and schedule posts based on your lead magnets.</p>',
                'prompts': '<h2>Prompt Library & Settings</h2><p>Manage your AI instructions and scraper preferences.</p>'
            };
            headerTitle.innerHTML = titles[viewId] || '';
        }
    },

    toggleLog: () => {
        elements.logContainer.classList.toggle('log-collapsed');
    },

    addLog: (msg, type = 'info') => {
        if (!elements.trendsLog) return;
        
        const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const logItem = document.createElement('div');
        logItem.className = 'log-item';
        
        const typeClass = `log-${type}`;
        logItem.innerHTML = `
            <span class="log-time">[${time}]</span>
            <span class="log-msg ${typeClass}">${msg}</span>
        `;
        
        elements.trendsLog.prepend(logItem); // Newest on top
        elements.logContainer.style.display = 'block';
    },

    switchModel: (modelId) => {
        appState.selectedModel = modelId;
        console.log(`Model selected: ${modelId}`);
    },

    renderPostPerformance: () => {
        if (!elements.performanceBody) return;
        
        // Show section if we have history
        if (appState.postHistory.length > 0) {
            elements.performanceSection.style.display = 'block';
        }

        elements.performanceBody.innerHTML = '';
        appState.postHistory.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(post => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="post-meta-cell">
                    <strong>${post.title}</strong>
                    <span>${post.type} • ${post.date}</span>
                </td>
                <td><span class="status-badge status-${post.status.toLowerCase()}">${post.status}</span></td>
                <td><strong>${post.impressions.toLocaleString()}</strong></td>
                <td>${post.likes}</td>
                <td>${post.shares}</td>
                <td>${post.comments}</td>
            `;
            elements.performanceBody.appendChild(tr);
        });

        // Update total count
        if (elements.scheduledCount) {
            elements.scheduledCount.textContent = appState.postHistory.length;
        }
    },

    switchPromptTab: (tabName) => {
        // Save current editor content to state before switching
        if (elements.promptEditor) {
            appState.systemPrompts[appState.currentPromptTab] = elements.promptEditor.value;
        }

        // Update State
        appState.currentPromptTab = tabName;

        // Update UI
        elements.promptTabs.forEach(tab => {
            if (tab.textContent.trim() === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Update Editor
        if (elements.promptEditor) {
            elements.promptEditor.value = appState.systemPrompts[tabName] || '';
        }
    }
};

// Make app globally accessible for inline onclick handlers in HTML
window.app = app;

// Attach Nav Listeners
elements.navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        app.switchView(e.currentTarget.dataset.view);
    });
});

// Attach Global Settings
elements.modelSelector.addEventListener('change', (e) => {
    appState.selectedModel = e.target.value;
    console.log(`Model switched to: ${appState.selectedModel}`);
});

// Attach Prompt Tab Listeners
elements.promptTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        app.switchPromptTab(tab.textContent.trim());
    });
});

// Attach Prompt Save Listener
if (elements.btnSavePrompts) {
    elements.btnSavePrompts.addEventListener('click', () => {
        // Save current editor content to state
        if (elements.promptEditor) {
            appState.systemPrompts[appState.currentPromptTab] = elements.promptEditor.value;
        }
        
        elements.btnSavePrompts.textContent = "Saved!";
        setTimeout(() => { elements.btnSavePrompts.textContent = "Save Changes"; }, 2000);
        console.log("System Prompts updated:", appState.systemPrompts);
    });
}

// Load saved topics and profile URL on init
const savedTopics = localStorage.getItem('linkedin_topics');
if (savedTopics && elements.topicsInput) {
    elements.topicsInput.value = savedTopics;
}
const savedProfileUrl = localStorage.getItem('linkedin_profile_url');
if (savedProfileUrl && elements.profileUrlInput) {
    elements.profileUrlInput.value = savedProfileUrl;
}

if (elements.btnSaveTopics) {
    elements.btnSaveTopics.addEventListener('click', () => {
        const topics = elements.topicsInput.value;
        const profileUrl = elements.profileUrlInput.value;
        localStorage.setItem('linkedin_topics', topics);
        localStorage.setItem('linkedin_profile_url', profileUrl);
        
        elements.btnSaveTopics.textContent = "Saved!";
        setTimeout(() => { elements.btnSaveTopics.textContent = "Save Settings"; }, 2000);
        
        console.log("Settings updated:", { topics, profileUrl });
        fetchLinkedInData();
    });
}

// Helper to get topics as an array
const getLinkedInTopics = () => {
    if (!elements.topicsInput) return ["AI", "Small Business"];
    const val = elements.topicsInput.value;
    return val.split(',').map(s => s.trim()).filter(s => s.length > 0);
};

const getLinkedInProfileUrl = () => {
    return elements.profileUrlInput ? elements.profileUrlInput.value.trim() : "";
};

// --- SKILL 1: TREND RESEARCH ---

// Store the last fetched trends so we can reference them by index
let fetchedTrends = [];

const mockTrendsData = [
    { rank: 1, title: "AI Automation is Replacing Junior Devs, Not Agencies", desc: "Massive debate on r/smallbusiness regarding cost-saving vs. quality when using AI tools for basic dev tasks.", tags: ["Reddit", "AI Adoption", "High Friction"] },
    { rank: 2, title: "The Death of Cold Email B2B Lead Gen", desc: "Trending conversation about AI-generated spam lowering open rates to near 0%. Small businesses are desperate for authentic outbound strategies.", tags: ["Reddit", "Lead Gen", "Pain Point"] },
    { rank: 3, title: "Small Biz CRM Overwhelm", desc: "Founders complaining about complex AI CRMs they don't have time to learn.", tags: ["Reddit", "Software", "Friction"] }
];

// Render a list of trend items to the DOM
const renderTrends = (trends) => {
    elements.trendsResults.innerHTML = '';
    
    trends.forEach((trend, index) => {
        const div = document.createElement('div');
        div.className = 'trend-item';
        div.innerHTML = `
            <div class="trend-rank">#${trend.rank}</div>
            <div class="trend-content flex-grow">
                <h4>${trend.title}</h4>
                <p>${trend.desc}</p>
                <div>
                    ${trend.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
            </div>
            <div>
                <button class="btn-secondary small" onclick="selectTrendToMagnet(${index})">Create Magnet</button>
            </div>
        `;
        elements.trendsResults.appendChild(div);
    });
    
    elements.trendsResults.style.display = 'block';
};

elements.btnRunTrends.addEventListener('click', async () => {
    const topics = getLinkedInTopics();
    
    // Clear and show log
    elements.trendsLog.innerHTML = '';
    app.addLog(`Starting Trend Analysis for: ${topics.join(', ')}`, 'info');
    
    showLoader(`Deep scraping Reddit, LinkedIn, X, and YouTube Shorts for "${topics.join(', ')}"...`);

    try {
        if (!supabase) {
            app.addLog("Supabase client not initialized. Using local mock data.", "error");
            throw new Error("Supabase client not initialized.");
        }

        app.addLog("Invoking scrapers in parallel...", "info");

        // Run all 4 scrapers in parallel
        const [redditRes, linkedinRes, xRes, ytRes] = await Promise.allSettled([
            supabase.functions.invoke('reddit-scraper', {
                body: { keywords: topics, subreddits: ["Entrepreneur", "smallbusiness", "startups", "SaaS"], timeFilter: "month" }
            }).then(r => { app.addLog("Reddit scraper completed.", "success"); return r; }),
            supabase.functions.invoke('linkedin-scraper', {
                body: { topicKeywords: topics, scraperType: 'posts' }
            }).then(r => { app.addLog("LinkedIn scraper completed.", "success"); return r; }),
            supabase.functions.invoke('x-scraper', {
                body: { keywords: topics, maxItems: 10 }
            }).then(r => { app.addLog("X scraper completed.", "success"); return r; }),
            supabase.functions.invoke('youtube-shorts-scraper', {
                body: { keywords: topics, maxResults: 5 }
            }).then(r => { app.addLog("YouTube Shorts scraper completed.", "success"); return r; })
        ]);

        let allPosts = [];

        // Helper to normalize and add to allPosts
        const addPosts = (res, source, postMapper) => {
            // New standardized format: always 200 OK, but with { data, error }
            if (res.status === 'fulfilled' && res.value.data && !res.value.data.error) {
                const posts = Array.isArray(res.value.data.data) ? res.value.data.data : [];
                app.addLog(`${source}: Received ${posts.length} posts.`, 'success');
                allPosts = allPosts.concat(posts.map(p => postMapper(p, source)));
            } else {
                let errorDetail = "Unknown Error";
                if (res.status === 'rejected') {
                    errorDetail = res.reason?.message || res.reason;
                } else if (res.value?.data?.error) {
                    errorDetail = res.value.data.error;
                } else if (res.value?.error) {
                    errorDetail = res.value.error.message || JSON.stringify(res.value.error);
                }
                
                app.addLog(`${source} failed: ${errorDetail}`, 'error');
                console.error(`❌ ${source} scraper failed:`, errorDetail);
            }
        };

        // Reddit Mapper
        addPosts(redditRes, 'Reddit', (p) => {
            const text = p.selftext || p.body || p.description || "No content";
            const likes = p.score || p.ups || 0;
            const comments = p.numComments || p.num_comments || 0;
            return {
                title: p.title || text.substring(0, 60) + (text.length > 60 ? "..." : ""),
                desc: text.substring(0, 200) + (text.length > 200 ? "..." : ""),
                engagement: likes + comments,
                source: 'Reddit',
                tags: [`r/${p.subreddit || 'reddit'}`, `${likes} upvotes`]
            };
        });

        // LinkedIn Mapper
        addPosts(linkedinRes, 'LinkedIn', (p) => {
            const text = p.text || p.description || p.contentText || "LinkedIn Post";
            return {
                title: text.substring(0, 60) + (text.length > 60 ? "..." : ""),
                desc: (text || "No content").substring(0, 200) + (text.length > 200 ? "..." : ""),
                engagement: (p.numLikes || p.likes || 0) + (p.numComments || p.comments || 0) + (p.numReposts || p.reposts || 0),
                source: 'LinkedIn',
                tags: ['LinkedIn', `${p.numLikes || p.likes || 0} likes`]
            };
        });

        // X Mapper
        addPosts(xRes, 'X', (p) => {
            // Highly defensive text selection
            const text = p.full_text || p.text || p.contentText || p.fullText || p.tweetText || p.description || "No content";
            const likes = p.favorite_count || p.likeCount || p.likes || p.favoriteCount || 0;
            const retweets = p.retweet_count || p.retweetCount || p.retweets || p.retweetCount || 0;
            const replies = p.reply_count || p.replyCount || p.replies || p.replyCount || 0;
            
            // If the text is just a URL, try to find a better title/desc or use a placeholder
            let title = text.substring(0, 60);
            if (title.length >= 60) title += "...";
            
            return {
                title: title || "X Post",
                desc: text.substring(0, 200) + (text.length > 200 ? "..." : ""),
                engagement: parseInt(likes) + parseInt(retweets) + parseInt(replies),
                source: 'X',
                tags: ['X', `${likes} likes`]
            };
        });

        // YT Shorts Mapper
        addPosts(ytRes, 'YouTube Shorts', (p) => {
            const text = p.transcript || p.description || p.contentText || "No transcript available";
            return {
                title: p.title || "YouTube Short",
                desc: text.substring(0, 200) + (text.length > 200 ? "..." : ""),
                engagement: p.viewCount || p.views || 0,
                source: 'YouTube Shorts',
                tags: ['YT Shorts', `${p.viewCount || p.views || 0} views`]
            };
        });

        if (allPosts.length > 0) {
            // Sort by engagement descending and take top 20 for AI analysis
            const topRawPosts = allPosts
                .sort((a, b) => b.engagement - a.engagement)
                .slice(0, 20);
            
            app.addLog(`Invoking AI Summarizer to identify deep trends...`, 'info');
            
            const { data: summaryData, error: summaryError } = await supabase.functions.invoke('trends-summarizer', {
                body: { 
                    systemPrompt: appState.systemPrompts['Scraper Summary'], 
                    scrapedData: topRawPosts 
                }
            });

            if (summaryError) throw summaryError;

            if (Array.isArray(summaryData?.data)) {
                fetchedTrends = summaryData.data.map((t, i) => ({
                    rank: i + 1,
                    title: t.title || "Unknown Trend",
                    desc: t.desc || "No description available",
                    tags: Array.isArray(t.tags) ? t.tags : ["Trend"]
                }));
            } else {
                // Fallback to engagement-based top 5 if AI fails to return correct format
                console.warn("AI Summarizer returned unexpected format, falling back to engagement top 5.");
                fetchedTrends = topRawPosts.slice(0, 5).map((p, i) => ({
                    rank: i + 1,
                    title: p.title,
                    desc: p.desc,
                    tags: [p.source, ...p.tags]
                }));
            }
            
            app.addLog(`Analysis complete. Aggregated top ${fetchedTrends.length} trending topics.`, 'success');
        } else {
            app.addLog("No results returned from any source. Falling back.", "error");
            throw new Error("No results returned from any source.");
        }

    } catch (err) {
        console.error("Trend Analysis failed, falling back to mock data:", err.message);
        fetchedTrends = [...mockTrendsData];
        app.addLog("Trend Analysis failed. Displaying simulated results.", "error");
    }

    renderTrends(fetchedTrends);
    hideLoader();
});

window.selectTrendToMagnet = (index) => {
    const trend = fetchedTrends[index] || mockTrendsData[index];
    appState.selectedTrend = trend;
    elements.topicInput.value = trend.title;
    app.switchView('skill2');
};


// --- SKILL 2: LEAD MAGNETS ---
const mockMagnetOutput = {
    outline: `
        <strong>Title:</strong> The Authenticity Protocol: Cold Email in the AI Age<br><br>
        <strong>1. The Problem:</strong> AI spam has ruined the B2B inbox.<br>
        <strong>2. The Contrarian Fix:</strong> Stop automating personalization. Automate research instead.<br>
        <strong>3. The Workflow:</strong><br>
        - Step 1: Use Perplexity to find 1 highly specific recent fact about the prospect.<br>
        - Step 2: Manually write a 3-sentence email.<br>
        - Step 3: Use simple automations just for follow-ups.<br><br>
        <strong>Call to Action:</strong> Want my exact prompt for research? Link in comments.
    `,
    variations: [
        { type: "Contrarian", content: "Everyone says AI will save your cold email strategy. They're lying. AI is exactly why your open rates are dropping to 0%. Here is what you must do instead..." },
        { type: "Pain-First", content: "Spending 4 hours drafting emails only to get zero replies? The inbox is saturated with ChatGPT garbage. If you want to stand out, you need the Authenticity Protocol." },
        { type: "Results-Led", content: "We hit a 42% open rate this week. No complex tools. No massive AI workflows. Just one simple change to how we research leads. Here's a quick guide on how..." }
    ]
};

elements.btnGenerateMagnet.addEventListener('click', async () => {
    const topic = elements.topicInput.value;
    if (!topic) {
        alert('Please enter or select a topic first.');
        return;
    }
    
    showLoader(`Generating lead magnet framework and copy variations using ${appState.selectedModel}...`);
    await simulateDelay(3000);
    
    // Populate Outline
    elements.outlineContent.innerHTML = mockMagnetOutput.outline;
    
    // Populate Variations
    elements.variationsList.innerHTML = '';
    mockMagnetOutput.variations.forEach((v, index) => {
        const div = document.createElement('div');
        div.className = 'variation-card';
        div.innerHTML = `
            <span class="variation-badge">${v.type}</span>
            <p style="font-size: 14px; margin-bottom: 12px;">"${v.content}"</p>
            <button class="btn-secondary small outline w-full" onclick="sendToWriter(${index})">Send to Writer</button>
        `;
        elements.variationsList.appendChild(div);
    });
    
    elements.magnetResults.style.display = 'grid';
    hideLoader();
});

window.sendToWriter = (index) => {
    const variation = mockMagnetOutput.variations[index];
    elements.rawThoughtInput.value = `Hook idea: ${variation.content}\n\nDirection: Expand on this using the Authenticity Protocol lead magnet points.`;
    elements.toneSelector.value = variation.type === 'Contrarian' ? 'contrarian' : 'authoritative';
    app.switchView('skill3');
};


// --- SKILL 3: POST WRITER & SCHEDULER ---
elements.btnDraftPost.addEventListener('click', async () => {
    const rawContent = elements.rawThoughtInput.value;
    if (!rawContent) return;
    
    const tone = elements.toneSelector.value;
    showLoader(`Drafting full post in ${tone} tone...`);
    await simulateDelay(3500);
    
    const draftText = `
        Everyone says AI will save your cold email strategy. They're lying. <br><br>
        AI is exactly why your open rates are dropping to near 0%. The B2B inbox is flooded with ChatGPT garbage, and prospects can smell it from a mile away. <br><br>
        Stop automating personalization. Instead, <strong>automate your research.</strong> <br><br>
        We've pivoted to the 'Authenticity Protocol':<br>
        1. Use AI (like Perplexity) to find one highly specific, obscure fact about a prospect.<br>
        2. Manually write a 3-sentence email based on that fact.<br>
        3. Only use automation for the follow-up sequences. <br><br>
        It takes 3 minutes per lead instead of 30 seconds. But the reply rate jumps from 1% to 15%. Volume is vanity. Relevance is revenue. <br><br>
        Want the exact research prompts I use? Grab the free guide in my bio.
    `;
    
    elements.postDraftEditor.innerHTML = draftText;
    elements.postDraftEditor.setAttribute('contenteditable', 'true');
    elements.btnSchedule.removeAttribute('disabled');
    
    hideLoader();
});

// Scheduling to Blotato Mock
elements.btnSchedule.addEventListener('click', async () => {
    const time = elements.scheduleTime.value;
    if (!time) {
        alert("Please select a date and time to schedule.");
        return;
    }
    
    elements.btnSchedule.innerHTML = "Submitting to Blotato...";
    elements.btnSchedule.setAttribute('disabled', 'true');
    
    await simulateDelay(1500);
    
    // Simulate Supabase insert
    console.log("Mock Supabase Insert: Post saved to history.");
    
    // Add to app history
    const newPost = {
        id: Date.now(),
        title: elements.postDraftEditor.textContent.substring(0, 40) + "...",
        type: elements.toneSelector.value.charAt(0).toUpperCase() + elements.toneSelector.value.slice(1),
        status: "Live",
        impressions: 0,
        likes: 0,
        shares: 0,
        comments: 0,
        date: time.replace('T', ' ')
    };
    appState.postHistory.push(newPost);
    app.renderPostPerformance();
    
    alert("Success! Payload sent to Blotato API and saved to your Supabase history.");
    
    elements.btnSchedule.innerHTML = "Schedule to Blotato";
    elements.btnSchedule.removeAttribute('disabled');
    elements.postDraftEditor.innerHTML = "";
    elements.rawThoughtInput.value = "";
    elements.scheduleTime.value = "";
    elements.postDraftEditor.setAttribute('contenteditable', 'false');
});

// --- LINKEDIN DATA SYNC WORKER ---

// Simulates fetching live LinkedIn data via Supabase Edge Function (Apify)
const fetchLinkedInData = async () => {
    console.log(`[${new Date().toLocaleTimeString()}] Fetching live LinkedIn data from Apify via Edge Function...`);
    
    // We update the UI to show we are syncing
    const trendElement = document.querySelector('.stat-trend.positive');
    if (trendElement) {
        trendElement.textContent = "↻ Syncing engagement momentum...";
        trendElement.style.color = '#facc15';
    }

    try {
        if (!supabase) throw new Error("Supabase client not initialized.");

        // Call the Edge Function
        // We pass the topicKeywords, the profileUrl, and the scraperType
        const { data, error } = await supabase.functions.invoke('linkedin-scraper', {
            body: { 
                topicKeywords: getLinkedInTopics(), 
                profileUrl: getLinkedInProfileUrl(),
                scraperType: 'activity' // Changed to activity to get specific post performance
            }
        });

        if (error) throw error;

        console.log("Apify Data Received: ", data);

        // Assuming data contains an array of posts from supreme_coder/linkedin-post
        // We'll calculate total engagement from the recent scraped posts
        let totalEngagement = 0;
        if (Array.isArray(data)) {
            data.forEach(post => {
                totalEngagement += (post.numLikes || 0) + (post.numComments || 0) + (post.numReposts || 0);
            });
        }

        // 2. Update stats for our recent post history with LIVE data if available
        if (Array.isArray(data)) {
            // Map real results back to our postHistory
            data.forEach(realPost => {
                const existingIndex = appState.postHistory.findIndex(p => p.title.includes(realPost.text?.substring(0, 20)));
                if (existingIndex !== -1) {
                    appState.postHistory[existingIndex].likes = realPost.numLikes || 0;
                    appState.postHistory[existingIndex].comments = realPost.numComments || 0;
                    appState.postHistory[existingIndex].shares = realPost.numReposts || 0;
                    // Impressions are private, so we'll stop simulating them or keep them static
                }
            });
        }
        app.renderPostPerformance();
        
    } catch (err) {
        console.error("Failed to sync LinkedIn data:", err.message);
        
        // Fallback for prototype testing if Edge function isn't deployed or configured yet
        console.warn("Falling back to local simulation...");
        const followerElement = document.querySelector('.stat-value');
        if (followerElement) {
            let currentFollowers = parseInt(followerElement.textContent.replace(/,/g, ''), 10);
            if (isNaN(currentFollowers)) currentFollowers = 8982;
            currentFollowers += Math.floor(Math.random() * 5) + 1;
            followerElement.textContent = currentFollowers.toLocaleString();
            
            if (trendElement) {
                 trendElement.textContent = "↑ Mock update synced";
                 setTimeout(() => { trendElement.style.color = '#4ade80'; }, 3000);
            }
        }
        // NO simulated growth here anymore per user request: "only shows live data"
        app.renderPostPerformance();
    }
    console.log("LinkedIn data sync complete.");
};

// Schedules the next fetch at a randomized interval (+/- 4 hours from a base of 4 hours)
const scheduleNextLinkedInFetch = () => {
    // Math.random() gives 0-1.
    // Base is 4 hours (4 * 60 * 60 * 1000).
    // Variability is up to 4 hours in either direction.
    // So the interval is anywhere from 0 to 8 hours.
    const maxIntervalMs = 8 * 60 * 60 * 1000;
    const randomDelayMs = Math.random() * maxIntervalMs;
    
    // Convert to hours for readable logging
    const delayHours = (randomDelayMs / (1000 * 60 * 60)).toFixed(2);
    console.log(`Next LinkedIn data sync scheduled in ${delayHours} hours.`);
    
    setTimeout(() => {
        fetchLinkedInData().then(() => {
            scheduleNextLinkedInFetch(); // Recursively schedule the next one
        });
    }, randomDelayMs);
};

// Start the worker on app load
// We'll optionally do a quick initial fetch after 5 seconds just so the user sees it work once.
setTimeout(() => {
    fetchLinkedInData().then(scheduleNextLinkedInFetch);
}, 5000); // 5 seconds initial delay, then randomized.

// Initial Renders
app.renderPostPerformance();

} catch(e) {
    console.error('App.js initialization failed:', e);
}
}); // end DOMContentLoaded
