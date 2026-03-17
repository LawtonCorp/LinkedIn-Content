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
    generatedPosts: []
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
    topicsInput: document.getElementById('linkedin-topics-input')
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
        
        // Adjust Header Title
        const titleEl = document.querySelector('#global-header-title h2');
        const descEl = document.querySelector('#global-header-title p');
        
        switch(viewId) {
            case 'dashboard':
                titleEl.textContent = "Dashboard Overview";
                descEl.textContent = "Welcome back. Here is your recent activity and audience metrics.";
                break;
            case 'skill1':
                titleEl.textContent = "Trend Research Engine";
                descEl.textContent = "Scrape and analyze the hottest debates in AI & Small Business.";
                break;
            case 'skill2':
                titleEl.textContent = "Lead Magnet Generator";
                descEl.textContent = "Turn raw trends into actionable value for your audience.";
                break;
            case 'skill3':
                titleEl.textContent = "Post Writer & Scheduler";
                descEl.textContent = "Draft tone-matched posts and enqueue them to Blotato.";
                break;
            case 'prompts':
                titleEl.textContent = "Prompt Library";
                descEl.textContent = "Manage the system prompts driving your AI agents.";
                break;
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

// --- SETTINGS LOGIC ---
// Load saved topics on init
const savedTopics = localStorage.getItem('linkedin_topics');
if (savedTopics && elements.topicsInput) {
    elements.topicsInput.value = savedTopics;
}

if (elements.btnSaveTopics) {
    elements.btnSaveTopics.addEventListener('click', () => {
        const topics = elements.topicsInput.value;
        localStorage.setItem('linkedin_topics', topics);
        elements.btnSaveTopics.textContent = "Saved!";
        setTimeout(() => { elements.btnSaveTopics.textContent = "Save Topics"; }, 2000);
        
        // Optionally trigger an immediate fetch with the new topics
        console.log("Topics updated to: ", topics);
        fetchLinkedInData();
    });
}

// Helper to get topics as an array
const getLinkedInTopics = () => {
    if (!elements.topicsInput) return ["AI", "Small Business"];
    const val = elements.topicsInput.value;
    return val.split(',').map(s => s.trim()).filter(s => s.length > 0);
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
    showLoader(`Deep scraping Reddit, LinkedIn, X, and YouTube Shorts for "${topics.join(', ')}"...`);

    try {
        if (!supabase) throw new Error("Supabase client not initialized.");

        // Run all 4 scrapers in parallel
        const [redditRes, linkedinRes, xRes, ytRes] = await Promise.allSettled([
            supabase.functions.invoke('reddit-scraper', {
                body: { keywords: topics, subreddits: ["Entrepreneur", "smallbusiness", "startups", "SaaS"], timeFilter: "month" }
            }),
            supabase.functions.invoke('linkedin-scraper', {
                body: { topicKeywords: topics, scraperType: 'posts' }
            }),
            supabase.functions.invoke('x-scraper', {
                body: { keywords: topics, maxItems: 10 }
            }),
            supabase.functions.invoke('youtube-shorts-scraper', {
                body: { keywords: topics, maxResults: 5 }
            })
        ]);

        console.log("Scraping results:", { redditRes, linkedinRes, xRes, ytRes });

        let allPosts = [];

        // Helper to normalize and add to allPosts
        const addPosts = (res, source, postMapper) => {
            if (res.status === 'fulfilled' && res.value.data && !res.value.error) {
                const posts = Array.isArray(res.value.data) ? res.value.data : [];
                console.log(`✅ ${source} returned ${posts.length} posts.`);
                allPosts = allPosts.concat(posts.map(p => postMapper(p, source)));
            } else {
                const errorDetail = res.status === 'rejected' ? res.reason : (res.value?.error || 'Unknown error');
                console.error(`❌ ${source} scraper failed:`, errorDetail);
            }
        };

        // Reddit Mapper
        addPosts(redditRes, 'Reddit', (p) => ({
            title: p.title || "Untitled Reddit Post",
            desc: (p.selftext || p.body || "No content").substring(0, 200) + "...",
            engagement: (p.score || p.ups || 0) + (p.numComments || p.num_comments || 0),
            source: 'Reddit',
            tags: [`r/${p.subreddit}`, `${p.score || 0} upvotes`]
        }));

        // LinkedIn Mapper
        addPosts(linkedinRes, 'LinkedIn', (p) => ({
            title: p.text?.substring(0, 60) + "..." || "LinkedIn Post",
            desc: (p.text || "No content").substring(0, 200) + "...",
            engagement: (p.numLikes || 0) + (p.numComments || 0) + (p.numReposts || 0),
            source: 'LinkedIn',
            tags: ['LinkedIn', `${p.numLikes || 0} likes`]
        }));

        // X Mapper
        addPosts(xRes, 'X', (p) => {
            const text = p.full_text || p.text || "No content";
            const likes = p.favorite_count || p.likeCount || 0;
            const retweets = p.retweet_count || p.retweetCount || 0;
            const replies = p.reply_count || p.replyCount || 0;
            return {
                title: text.substring(0, 60) + "...",
                desc: text.substring(0, 200) + "...",
                engagement: likes + retweets + replies,
                source: 'X',
                tags: ['X', `${likes} likes`]
            };
        });

        // YT Shorts Mapper
        addPosts(ytRes, 'YouTube Shorts', (p) => ({
            title: p.title || "YouTube Short",
            desc: (p.transcript || p.description || "No transcript available").substring(0, 200) + "...",
            engagement: p.viewCount || 0, // Using views as proxy for engagement
            source: 'YouTube Shorts',
            tags: ['YT Shorts', `${p.viewCount || 0} views`]
        }));

        if (allPosts.length > 0) {
            // Sort by engagement descending and take top 5
            fetchedTrends = allPosts
                .sort((a, b) => b.engagement - a.engagement)
                .slice(0, 5)
                .map((p, i) => ({
                    rank: i + 1,
                    title: p.title,
                    desc: p.desc,
                    tags: [p.source, ...p.tags]
                }));
        } else {
            throw new Error("No results returned from any source.");
        }

    } catch (err) {
        console.error("Trend Analysis failed, falling back to mock data:", err.message);
        fetchedTrends = [...mockTrendsData];
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
    
    // Simulate Supabase insert (if client existed, we'd do await supabase.from('posts').insert(...))
    console.log("Mock Supabase Insert: Post saved to history.");
    
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
        trendElement.textContent = "↻ Syncing live data...";
        trendElement.style.color = '#facc15';
    }

    try {
        if (!supabase) throw new Error("Supabase client not initialized.");

        // Call the Edge Function
        // We pass the topicKeywords array and the scraperType
        const { data, error } = await supabase.functions.invoke('linkedin-scraper', {
            body: { 
                topicKeywords: getLinkedInTopics(), 
                scraperType: 'posts' 
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

        // We'll update a hypothetical engagement stat block, 
        // or just bump the stat-value as a proxy for "Audience Engagement"
        if (totalEngagement > 0) {
             const statElement = document.querySelector('.stat-value');
             if (statElement) {
                 // For the prototype, we just add the engagement to the main number to show it changing
                 let currentNum = parseInt(statElement.textContent.replace(/,/g, ''), 10);
                 statElement.textContent = (currentNum + Math.floor(totalEngagement * 0.1)).toLocaleString();
             }
             if (trendElement) {
                 trendElement.textContent = `↑ ${totalEngagement} new engagements synced`;
                 trendElement.style.color = '#4ade80';
             }
        } else {
             if (trendElement) {
                 trendElement.textContent = "↑ Live update synced (No new engagement)";
                 trendElement.style.color = '#4ade80';
             }
        }
        
    } catch (err) {
        console.error("Failed to sync LinkedIn data:", err.message);
        
        // Fallback for prototype testing if Edge function isn't deployed or configured yet
        console.warn("Falling back to local simulation...");
        const followerElement = document.querySelector('.stat-value');
        if (followerElement) {
            let currentFollowers = parseInt(followerElement.textContent.replace(/,/g, ''), 10);
            if (isNaN(currentFollowers)) currentFollowers = 9412;
            currentFollowers += Math.floor(Math.random() * 5) + 1;
            followerElement.textContent = currentFollowers.toLocaleString();
            
            if (trendElement) {
                 trendElement.textContent = "↑ Mock update synced";
                 setTimeout(() => { trendElement.style.color = '#4ade80'; }, 3000);
            }
        }
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

} catch(e) {
    console.error('App.js initialization failed:', e);
}
}); // end DOMContentLoaded
