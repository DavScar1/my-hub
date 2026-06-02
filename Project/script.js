/* ============================================================
   CollegeROI Ireland — Main Script
   ============================================================ */

'use strict';

// State
let allCourses = [];
let allCoursesData = [];
let investmentChartInstance = null;
let coursesLoaded = false;
let currentCourseData = null;
let activeFilters = { universities: [], fields: [], sortBy: 'roi-desc' };

const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:5000'
    : '';

const STORAGE_KEYS = {
    LAST_COURSE:       'roi_calc_last_course',
    USE_CUSTOM_TUITION:'roi_calc_use_custom_tuition',
    CUSTOM_TUITION:    'roi_calc_custom_tuition',
    ENABLE_PART_TIME:  'roi_calc_enable_part_time',
    PART_TIME_HOURS:   'roi_calc_part_time_hours',
};

/* ============================================================
   Navigation
   ============================================================ */

function switchView(viewName) {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    event.currentTarget.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewName + 'View').classList.add('active');
    hideAllResults();
    if (viewName === 'explore' && allCoursesData.length > 0) renderCourseGrid(allCoursesData);
}

function toggleSection(sectionId) {
    const section = document.getElementById(sectionId);
    const header  = event.currentTarget;
    section.classList.toggle('expanded');
    header.classList.toggle('expanded');
}

function hideAllResults() {
    const r   = document.getElementById('results');
    const ph  = document.getElementById('resultsPlaceholder');
    const cr  = document.getElementById('comparisonResults');
    const err = document.getElementById('error');
    if (r)   { r.style.display = 'none'; }
    if (ph)  { ph.style.display = 'flex'; }
    if (cr)  { cr.style.display = 'none'; }
    if (err) { err.style.display = 'none'; }
}

function showError(msg) {
    const el = document.getElementById('error');
    document.getElementById('errorMessage').textContent = msg;
    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================
   Bootstrap — load everything in ONE request
   ============================================================ */

window.onload = function () {
    fetch(`${API_BASE_URL}/courses-bulk`)
        .then(r => {
            if (!r.ok) throw new Error('Failed to load courses from server');
            return r.json();
        })
        .then(data => {
            if (!data.success || !Array.isArray(data.courses)) {
                throw new Error('Invalid data received from server');
            }

            allCoursesData = data.courses;
            allCourses     = allCoursesData.map(c => c.course_name);
            coursesLoaded  = true;

            populateCourseDropdowns();
            loadSavedPreferences();
        })
        .catch(err => {
            console.error('Bootstrap error:', err);
            showError('Failed to load courses. Make sure the Flask server is running on port 5000.');
        });
};

function populateCourseDropdowns() {
    const dd  = document.getElementById('course');
    const mdd = document.getElementById('coursesMultiple');

    allCourses.forEach(name => {
        dd.add(new Option(name, name));
        mdd.add(new Option(name, name));
    });
}

/* ============================================================
   Preferences (localStorage)
   ============================================================ */

function savePreferences() {
    const course = document.getElementById('course').value;
    if (course) localStorage.setItem(STORAGE_KEYS.LAST_COURSE, course);
    localStorage.setItem(STORAGE_KEYS.USE_CUSTOM_TUITION, document.getElementById('useCustomTuition').checked);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_TUITION,     document.getElementById('customTuition').value);
    localStorage.setItem(STORAGE_KEYS.ENABLE_PART_TIME,   document.getElementById('enablePartTime').checked);
    localStorage.setItem(STORAGE_KEYS.PART_TIME_HOURS,    document.getElementById('partTimeHours').value);
}

function loadSavedPreferences() {
    const lastCourse      = localStorage.getItem(STORAGE_KEYS.LAST_COURSE);
    const useCustom       = localStorage.getItem(STORAGE_KEYS.USE_CUSTOM_TUITION) === 'true';
    const customTuition   = localStorage.getItem(STORAGE_KEYS.CUSTOM_TUITION);
    const enablePartTime  = localStorage.getItem(STORAGE_KEYS.ENABLE_PART_TIME) === 'true';
    const partTimeHours   = localStorage.getItem(STORAGE_KEYS.PART_TIME_HOURS);

    if (lastCourse) {
        document.getElementById('course').value = lastCourse;
        document.getElementById('savedPreferencesNotice').style.display = 'flex';
    }
    if (useCustom) {
        document.getElementById('useCustomTuition').checked = true;
        document.getElementById('customTuitionFields').style.display = 'block';
        if (customTuition) document.getElementById('customTuition').value = customTuition;
    }
    if (enablePartTime) {
        document.getElementById('enablePartTime').checked = true;
        document.getElementById('partTimeFields').style.display = 'block';
        if (partTimeHours) {
            document.getElementById('partTimeHours').value = partTimeHours;
            document.getElementById('hoursDisplay').textContent = partTimeHours;
            updatePartTimeCalculations();
        }
    }
}

function clearSavedPreferences() {
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    document.getElementById('course').value            = '';
    document.getElementById('useCustomTuition').checked= false;
    document.getElementById('customTuitionFields').style.display = 'none';
    document.getElementById('customTuition').value     = '';
    document.getElementById('enablePartTime').checked  = false;
    document.getElementById('partTimeFields').style.display = 'none';
    document.getElementById('partTimeHours').value     = 10;
    document.getElementById('hoursDisplay').textContent= '10';
    document.getElementById('savedPreferencesNotice').style.display = 'none';
    hideAllResults();
}

/* ============================================================
   DOMContentLoaded — wire up interactive controls
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

    // Custom tuition toggle
    document.getElementById('useCustomTuition').addEventListener('change', function () {
        document.getElementById('customTuitionFields').style.display = this.checked ? 'block' : 'none';
    });

    // Part-time toggle
    document.getElementById('enablePartTime').addEventListener('change', function () {
        document.getElementById('partTimeFields').style.display = this.checked ? 'block' : 'none';
        if (this.checked) updatePartTimeCalculations();
    });

    // Sliders
    document.getElementById('partTimeHours').addEventListener('input', function () {
        document.getElementById('hoursDisplay').textContent = this.value;
        updatePartTimeCalculations();
    });

    document.getElementById('hourlyRate').addEventListener('input', function () {
        document.getElementById('rateDisplay').textContent = parseFloat(this.value).toFixed(2);
        updatePartTimeCalculations();
    });

    // Search
    const searchInput   = document.getElementById('courseSearch');
    const searchResults = document.getElementById('searchResults');
    const clearBtn      = document.getElementById('clearSearch');

    searchInput.addEventListener('input', function () {
        const q = this.value.trim();
        if (q.length > 0) {
            clearBtn.style.display = 'flex';
            displaySearchResults(searchCourses(q), q);
        } else {
            clearBtn.style.display = 'none';
            searchResults.style.display = 'none';
        }
    });

    clearBtn.addEventListener('click', function () {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        searchResults.style.display = 'none';
        searchInput.focus();
    });

    document.addEventListener('click', function (e) {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.style.display = 'none';
        }
    });
});

/* ============================================================
   Search
   ============================================================ */

function searchCourses(query) {
    const lq = query.toLowerCase();
    return allCourses.filter(c => c.toLowerCase().includes(lq));
}

function displaySearchResults(results, query) {
    const el = document.getElementById('searchResults');
    if (results.length === 0) {
        el.innerHTML = '<div style="padding:14px 16px;text-align:center;color:var(--text-3);font-size:14px;">No courses found</div>';
        el.style.display = 'block';
        return;
    }

    // Escape for RegExp but NOT for HTML — we'll use textContent for individual parts
    const escapedQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escapedQ, 'gi');

    let html = '';
    results.slice(0, 8).forEach(course => {
        const parts   = course.split(' - ');
        const uni     = parts.length > 1 ? parts[parts.length - 1] : '';
        // Highlight via mark but escape the course name first
        const safe    = course.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const highlighted = safe.replace(re, m => `<mark>${m}</mark>`);
        // encode course for onclick attribute
        const enc = course.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        html += `<div class="search-result-item" onclick="selectCourseFromSearch('${enc}')" role="option">
            <div>${highlighted}</div>
            <div class="search-result-meta">${uni}</div>
        </div>`;
    });

    el.innerHTML = html;
    el.style.display = 'block';
}

function selectCourseFromSearch(course) {
    document.getElementById('course').value = course;
    document.getElementById('courseSearch').value = '';
    document.getElementById('clearSearch').style.display = 'none';
    document.getElementById('searchResults').style.display = 'none';
}

/* ============================================================
   University filter (calculator dropdown)
   ============================================================ */

function filterByUniversity(uni) {
    const dd = document.getElementById('course');
    Array.from(dd.options).forEach(opt => {
        opt.style.display = opt.value.includes(` - ${uni}`) ? '' : 'none';
    });
    document.querySelectorAll('.filter-pills .pill').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active');
    dd.value = '';
}

function showAllCourses() {
    Array.from(document.getElementById('course').options).forEach(opt => { opt.style.display = ''; });
    document.querySelectorAll('.filter-pills .pill').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active');
    document.getElementById('course').value = '';
}

/* ============================================================
   Calculate ROI (single course)
   ============================================================ */

function calculateROI() {
    if (!coursesLoaded) { showError('Courses are still loading. Please wait a moment.'); return; }

    const course = document.getElementById('course').value;
    if (!course) { showError('Please select a course first.'); return; }

    let url = `${API_BASE_URL}/calculate?course=${encodeURIComponent(course)}`;

    const useCustom = document.getElementById('useCustomTuition').checked;
    if (useCustom) {
        const val = document.getElementById('customTuition').value;
        if (val) url += `&tuition=${val}`;
    }

    const btn = document.querySelector('.btn-primary[onclick="calculateROI()"]');
    if (btn) { btn.textContent = 'Calculating…'; btn.disabled = true; }

    fetch(url)
        .then(r => {
            if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Server error'); });
            return r.json();
        })
        .then(data => {
            if (!data.success) throw new Error(data.error || 'Calculation failed');

            currentCourseData = data.data;

            // Apply part-time adjustment client-side
            if (document.getElementById('enablePartTime').checked) {
                const hours       = parseInt(document.getElementById('partTimeHours').value);
                const hourlyRate  = parseFloat(document.getElementById('hourlyRate').value);
                const totalEarned = hours * hourlyRate * 30 * currentCourseData.course_length;
                const origCost    = currentCourseData.total_cost;
                currentCourseData.total_cost          = Math.max(0, origCost - totalEarned);
                currentCourseData.original_cost       = origCost;
                currentCourseData.part_time_earnings  = totalEarned;
                currentCourseData.payback_years       = currentCourseData.total_cost / currentCourseData.annual_net_income;
            }

            displaySingleResult(currentCourseData);
            savePreferences();
        })
        .catch(err => {
            console.error(err);
            showError(err.message || 'Failed to calculate.');
        })
        .finally(() => {
            if (btn) { btn.textContent = 'Calculate ROI'; btn.disabled = false; }
        });
}

/* ============================================================
   Part-time calculations
   ============================================================ */

function updatePartTimeCalculations() {
    const hours      = parseInt(document.getElementById('partTimeHours').value);
    const rate       = parseFloat(document.getElementById('hourlyRate').value);
    const weekly     = hours * rate;
    const annual     = weekly * 30;
    const courseLen  = currentCourseData ? currentCourseData.course_length : 4;
    const total      = annual * courseLen;

    document.getElementById('weeklyIncome').textContent  = '€' + Math.round(weekly).toLocaleString();
    document.getElementById('partTimeIncome').textContent = '€' + Math.round(annual).toLocaleString();
    document.getElementById('partTimeTotal').textContent  = '€' + Math.round(total).toLocaleString();
    document.getElementById('costReduction').textContent  = '€' + Math.round(total).toLocaleString();
}

/* ============================================================
   Display Single Result
   ============================================================ */

function displaySingleResult(d) {
    document.getElementById('resultsPlaceholder').style.display = 'none';
    const resultsEl = document.getElementById('results');
    resultsEl.style.display = 'block';

    if (window.innerWidth <= 768) window.scrollTo({ top: 0, behavior: 'smooth' });

    // Customisation badges
    let badgesHTML = '';
    if (document.getElementById('useCustomTuition').checked) {
        const v = document.getElementById('customTuition').value;
        if (v) badgesHTML += `<span class="badge badge-info">Custom tuition: €${parseFloat(v).toLocaleString()}/yr</span>`;
    }
    if (document.getElementById('enablePartTime').checked && d.part_time_earnings) {
        const h = document.getElementById('partTimeHours').value;
        const r = document.getElementById('hourlyRate').value;
        badgesHTML += `<span class="badge badge-info">Part-time: ${h}h/wk @ €${parseFloat(r).toFixed(2)}/hr</span>`;
    }

    const salaryIncrease = Math.round(((d.salary_after_5_years - d.starting_salary) / d.starting_salary) * 100);

    // Career insights section
    let careerHTML = '';
    if (d.course_data) {
        const cd = d.course_data;

        const progressionPct = { 'Excellent': 100, 'Very Good': 85, 'Good': 70, 'Fair': 50 }[cd.career_progression] || 60;
        const skillsPct      = { 'Very High': 100, 'High': 75, 'Medium': 50, 'Low': 25 }[cd.skills_demand] || 50;

        const employerTags = (cd.top_employers || []).map(e =>
            `<span class="employer-tag">${e}</span>`
        ).join('');

        const roleItems = (cd.typical_roles || []).map(r =>
            `<div class="role-item"><span class="role-arrow">→</span><span class="role-label">${r}</span></div>`
        ).join('');

        const salaryRangeHTML = cd.startup_salary_range ? `
        <div class="salary-range-card">
            <div class="salary-range-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                Expected Starting Salary Range
            </div>
            <div class="salary-range-row">
                <div class="salary-range-item">
                    <div class="salary-range-label">Minimum</div>
                    <div class="salary-range-value">€${(cd.startup_salary_range.min / 1000).toFixed(0)}k</div>
                </div>
                <div class="salary-range-arrow">→</div>
                <div class="salary-range-item">
                    <div class="salary-range-label">Maximum</div>
                    <div class="salary-range-value">€${(cd.startup_salary_range.max / 1000).toFixed(0)}k</div>
                </div>
            </div>
        </div>` : '';

        const industryGrowthHTML = cd.industry_growth_rate ? `
        <div class="work-card-row">
            <div class="work-card-row-label">Industry Growth</div>
            <div class="work-card-row-value green">${cd.industry_growth_rate}</div>
        </div>` : '';

        const classSizeHTML = cd.avg_class_size ? `
        <div class="work-card-row">
            <div class="work-card-row-label">Class Size</div>
            <div class="work-card-row-value">${cd.avg_class_size} students</div>
        </div>` : '';

        const internshipHTML = cd.internship_opportunities ? `
        <div class="work-card-row">
            <div class="work-card-row-label">Internships</div>
            <div class="work-card-row-value green">${cd.internship_opportunities}</div>
        </div>` : '';

        careerHTML = `
        <div class="result-section">
            <h3 class="result-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                Career Insights
            </h3>

            <div class="career-stats-grid">
                <div class="career-stat-card blue">
                    <div class="career-stat-num">${cd.employment_rate}%</div>
                    <div class="career-stat-name">Employment Rate</div>
                    <div class="career-stat-hint">within 9 months</div>
                </div>
                <div class="career-stat-card amber">
                    <div class="career-stat-num">${cd.graduate_satisfaction}</div>
                    <div class="career-stat-name">Student Rating</div>
                    <div class="career-stat-hint">out of 5 ★</div>
                </div>
                <div class="career-stat-card green">
                    <div class="career-stat-num">${cd.job_security}</div>
                    <div class="career-stat-name">Job Security</div>
                    <div class="career-stat-hint">stability rating</div>
                </div>
            </div>

            <div class="rating-bars">
                <h4 style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px;">Quality of Life Indicators</h4>
                <div class="rating-bar-group">
                    <div class="rating-bar-header">
                        <span class="rating-bar-label">Work-Life Balance</span>
                        <span class="rating-bar-value">${cd.work_life_balance}/5</span>
                    </div>
                    <div class="rating-bar-track"><div class="rating-bar-fill blue" style="width:${(cd.work_life_balance/5)*100}%"></div></div>
                </div>
                <div class="rating-bar-group">
                    <div class="rating-bar-header">
                        <span class="rating-bar-label">Career Progression</span>
                        <span class="rating-bar-value">${cd.career_progression}</span>
                    </div>
                    <div class="rating-bar-track"><div class="rating-bar-fill green" style="width:${progressionPct}%"></div></div>
                </div>
                <div class="rating-bar-group">
                    <div class="rating-bar-header">
                        <span class="rating-bar-label">Skills Demand</span>
                        <span class="rating-bar-value">${cd.skills_demand}</span>
                    </div>
                    <div class="rating-bar-track"><div class="rating-bar-fill amber" style="width:${skillsPct}%"></div></div>
                </div>
            </div>

            <div class="work-cards-grid">
                <div class="work-card">
                    <div class="work-card-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                        Work Environment
                    </div>
                    <div class="work-card-row">
                        <div class="work-card-row-label">Remote Work</div>
                        <div class="work-card-row-value">${cd.remote_work_availability}</div>
                    </div>
                    ${classSizeHTML}
                    ${industryGrowthHTML}
                </div>
                <div class="work-card">
                    <div class="work-card-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                        Study & Opportunities
                    </div>
                    <div class="work-card-row">
                        <div class="work-card-row-label">Further Study Rate</div>
                        <div class="work-card-row-value">${cd.further_study_rate}% pursue postgrad</div>
                    </div>
                    <div class="work-card-row">
                        <div class="work-card-row-label">International Opps</div>
                        <div class="work-card-row-value">${cd.international_opportunities}</div>
                    </div>
                    ${internshipHTML}
                </div>
            </div>

            ${salaryRangeHTML}

            ${employerTags ? `
            <div style="margin-bottom:16px;">
                <h4 class="result-section-title" style="margin-bottom:12px;">Top Graduate Employers</h4>
                <div class="employers-wrap">${employerTags}</div>
            </div>` : ''}

            <div style="background:var(--purple-bg);padding:20px;border-radius:var(--radius);border:1.5px solid #e9d5ff;">
                <h4 class="result-section-title" style="color:var(--purple);margin-bottom:12px;">Common Career Paths</h4>
                <div class="roles-grid">${roleItems}</div>
            </div>
        </div>`;
    }

    const html = `
        <div class="results-header">
            <h2>${d.course_name}</h2>
            <p>${d.university}</p>
        </div>

        ${badgesHTML ? `<div class="badges">${badgesHTML}</div>` : ''}

        <!-- Big ROI number -->
        <div class="result-roi-hero">
            <div class="result-roi-label">5-Year Return on Investment</div>
            <div class="result-roi-number" id="roiCounter">0<span class="result-roi-suffix">%</span></div>
            <div class="result-roi-sub">${d.analysis.roi_emoji} ${d.analysis.roi_rating} · ${d.analysis.payback_label}</div>
        </div>

        <!-- Key metrics row -->
        <div class="result-metrics">
            <div class="result-metric">
                <div class="result-metric-label">Total Cost</div>
                <div class="result-metric-value">€${(d.total_cost / 1000).toFixed(0)}k</div>
                <div class="result-metric-sub">€${(d.tuition_per_year / 1000).toFixed(1)}k/yr × ${d.course_length} yrs</div>
            </div>
            <div class="result-metric">
                <div class="result-metric-label">Starting Salary</div>
                <div class="result-metric-value">€${(d.starting_salary / 1000).toFixed(0)}k</div>
                <div class="result-metric-sub">€${Math.round(d.starting_salary / 12).toLocaleString()}/mo</div>
            </div>
            <div class="result-metric">
                <div class="result-metric-label">Payback Period</div>
                <div class="result-metric-value">${d.payback_years.toFixed(1)}</div>
                <div class="result-metric-sub">years to recover</div>
            </div>
        </div>

        <!-- Key Insight -->
        <div class="result-section">
            <div class="result-insight">
                <svg class="result-insight-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <div>
                    <div class="result-insight-title">Key Insight</div>
                    <div class="result-insight-text">${d.analysis.recommendation}</div>
                </div>
            </div>
        </div>

        <!-- Salary Progression -->
        <div class="result-section">
            <h3 class="result-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                Salary Progression
            </h3>
            <div class="salary-prog">
                <div class="salary-prog-item">
                    <div class="salary-prog-label">Starting</div>
                    <div class="salary-prog-value">€${(d.starting_salary / 1000).toFixed(0)}k</div>
                    <div style="font-size:11px;color:var(--text-3);">Year 1</div>
                </div>
                <div class="salary-prog-arrow">
                    <svg width="36" height="20" viewBox="0 0 36 20" fill="none" aria-hidden="true">
                        <path d="M0 10 L28 10 M20 3 L28 10 L20 17" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <div class="salary-prog-item">
                    <div class="salary-prog-label">After 5 Years</div>
                    <div class="salary-prog-value is-green">€${(d.salary_after_5_years / 1000).toFixed(0)}k</div>
                    <div class="salary-prog-change">+${salaryIncrease}% increase</div>
                </div>
            </div>
        </div>

        <!-- Investment vs Returns Chart -->
        <div class="chart-section">
            <h3 class="result-section-title" style="margin-bottom:16px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                Investment vs Returns (5 Years)
            </h3>
            <div style="height:260px;">
                <canvas id="investmentChart" role="img" aria-label="Bar chart comparing investment cost to 5-year earnings"></canvas>
            </div>
        </div>

        ${careerHTML}

        <!-- Lifetime Earnings -->
        <div class="lifetime-card">
            <div class="lifetime-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                Lifetime Earnings Potential (30-year career)
            </div>
            <div class="lifetime-number">€${(d.analysis.lifetime.total_earnings / 1000000).toFixed(2)}M</div>
            <div class="lifetime-sub">You'll earn ${d.analysis.lifetime.times_earned_back}× your investment back over your career</div>
        </div>
    `;

    resultsEl.innerHTML = html;

    // Animate ROI counter
    animateCounter('roiCounter', d.roi_5_years, '%');

    // Draw chart after DOM updates
    requestAnimationFrame(() => createInvestmentChart(d));
}

/* ============================================================
   Animated counter
   ============================================================ */

function animateCounter(elementId, target, suffix, duration = 900) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const startTime = performance.now();

    function step(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased    = 1 - Math.pow(1 - progress, 3);
        const current  = Math.round(target * eased);
        el.innerHTML   = current + `<span class="result-roi-suffix">${suffix}</span>`;
        if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
}

/* ============================================================
   Investment Chart
   ============================================================ */

function createInvestmentChart(data) {
    const canvas = document.getElementById('investmentChart');
    if (!canvas) return;

    if (investmentChartInstance) { investmentChartInstance.destroy(); investmentChartInstance = null; }

    const totalCost = data.total_cost;
    const earnings  = data.annual_net_income * 5;
    const profit    = earnings - totalCost;

    investmentChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['You Invest', 'You Earn (5 yrs)', 'Your Profit'],
            datasets: [{
                data: [totalCost, earnings, profit],
                backgroundColor: ['rgba(239,68,68,0.8)', 'rgba(59,130,246,0.8)', 'rgba(16,185,129,0.85)'],
                borderColor:     ['#dc2626', '#2563eb', '#059669'],
                borderWidth: 2,
                borderRadius: 8,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,0.9)',
                    padding: 12,
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: { label: ctx => '€' + ctx.parsed.y.toLocaleString() },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => '€' + (v / 1000) + 'k', font: { size: 12 } },
                    grid: { color: 'rgba(0,0,0,0.04)' },
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 12, weight: '600' } },
                },
            },
        },
    });
}

/* ============================================================
   Browse / Explore filters
   ============================================================ */

function toggleFieldFilter(button) {
    button.classList.toggle('active');
    applyFilters();
}

function applyFilters() {
    activeFilters.universities = Array.from(document.querySelectorAll('.chip-checkbox input:checked')).map(cb => cb.value);
    activeFilters.fields       = Array.from(document.querySelectorAll('.chip-btn.active')).map(b => b.dataset.field);
    activeFilters.sortBy       = document.getElementById('sortBy')?.value || 'roi-desc';

    let filtered = [...allCoursesData];

    if (activeFilters.universities.length > 0) {
        filtered = filtered.filter(c => activeFilters.universities.some(u => c.course_name.includes(` - ${u}`)));
    }

    if (activeFilters.fields.length > 0) {
        filtered = filtered.filter(c => {
            const field = c.course_name.split(' - ')[0];
            return activeFilters.fields.some(f => field.includes(f) || f.includes(field));
        });
    }

    renderCourseGrid(sortCourses(filtered, activeFilters.sortBy));
}

function sortCourses(courses, sortBy) {
    const s = [...courses];
    switch (sortBy) {
        case 'roi-desc':     s.sort((a, b) => b.roi_5_years   - a.roi_5_years);   break;
        case 'roi-asc':      s.sort((a, b) => a.roi_5_years   - b.roi_5_years);   break;
        case 'payback-asc':  s.sort((a, b) => a.payback_years - b.payback_years); break;
        case 'payback-desc': s.sort((a, b) => b.payback_years - a.payback_years); break;
        case 'cost-asc':     s.sort((a, b) => a.total_cost    - b.total_cost);    break;
        case 'cost-desc':    s.sort((a, b) => b.total_cost    - a.total_cost);    break;
        case 'name':         s.sort((a, b) => a.course_name.localeCompare(b.course_name)); break;
    }
    return s;
}

function resetFilters() {
    document.querySelectorAll('.chip-checkbox input').forEach(cb => { cb.checked = false; });
    document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
    const sortEl = document.getElementById('sortBy');
    if (sortEl) sortEl.value = 'roi-desc';
    activeFilters = { universities: [], fields: [], sortBy: 'roi-desc' };
    renderCourseGrid(allCoursesData);
}

function showTop5(type) {
    const sorted = sortCourses(allCoursesData, type === 'roi' ? 'roi-desc' : type === 'payback' ? 'payback-asc' : 'cost-asc');
    renderCourseGrid(sorted.slice(0, 5));
    document.getElementById('courseGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderCourseGrid(courses) {
    const grid     = document.getElementById('courseGrid');
    const noResult = document.getElementById('noResults');

    if (courses.length === 0) {
        grid.style.display = 'none';
        noResult.style.display = 'flex';
        return;
    }

    grid.style.display = '';
    noResult.style.display = 'none';

    grid.innerHTML = courses.map(c => {
        const roiClass    = c.roi_5_years > 400 ? 'excellent' : c.roi_5_years > 300 ? 'good' : 'fair';
        const badgeClass  = c.roi_5_years > 400 ? 'badge-success' : c.roi_5_years > 300 ? 'badge-info' : 'badge-warning';
        const roiRating   = c.analysis ? c.analysis.roi_rating : '';
        const enc         = c.course_name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        return `
        <div class="course-card-item ${roiClass}" role="listitem" onclick="selectCourseFromGrid('${enc}')" tabindex="0" aria-label="${c.course_name}">
            <div class="course-card-header">
                <div class="course-card-title">${c.course_name.split(' - ')[0]}</div>
                <div class="course-card-subtitle">${c.university}</div>
            </div>
            <div class="course-stats">
                <div class="course-stat">
                    <div class="course-stat-label">ROI (5yr)</div>
                    <div class="course-stat-value">${c.roi_5_years}%</div>
                </div>
                <div class="course-stat">
                    <div class="course-stat-label">Payback</div>
                    <div class="course-stat-value">${c.payback_years.toFixed(1)}y</div>
                </div>
                <div class="course-stat">
                    <div class="course-stat-label">Total Cost</div>
                    <div class="course-stat-value">€${(c.total_cost / 1000).toFixed(0)}k</div>
                </div>
                <div class="course-stat">
                    <div class="course-stat-label">Start Salary</div>
                    <div class="course-stat-value">€${(c.starting_salary / 1000).toFixed(0)}k</div>
                </div>
            </div>
            <div><span class="badge ${badgeClass}" style="width:auto;display:inline-flex;">${roiRating} ROI</span></div>
        </div>`;
    }).join('');
}

function selectCourseFromGrid(course) {
    // Switch to calculator tab
    const calcBtn = document.querySelector('.nav-link[onclick*="calculator"]');
    if (calcBtn) calcBtn.click();
    setTimeout(() => {
        document.getElementById('course').value = course;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(calculateROI, 150);
    }, 100);
}

/* ============================================================
   Compare Multiple Courses
   ============================================================ */

function compareMultipleCourses() {
    if (!coursesLoaded) { showError('Courses are still loading.'); return; }

    const selected = Array.from(document.getElementById('coursesMultiple').selectedOptions).map(o => o.value);
    if (selected.length < 2) { showError('Select at least 2 courses to compare.'); return; }
    if (selected.length > 5) { showError('Select a maximum of 5 courses.'); return; }

    fetch(`${API_BASE_URL}/compare-multiple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courses: selected }),
    })
        .then(r => {
            if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Server error'); });
            return r.json();
        })
        .then(data => {
            if (!data.success) throw new Error(data.error || 'Comparison failed');
            displayComparisonResults(data);
        })
        .catch(err => { console.error(err); showError(err.message); });
}

function displayComparisonResults(data) {
    const { winners, courses } = data;

    const winnersHTML = `
    <div class="card" style="background:var(--emerald-bg);border-color:var(--emerald-bdr);">
        <div class="card-body">
            <h3 style="font-size:16px;font-weight:700;margin-bottom:14px;color:var(--text);">Winners by Category</h3>
            <div style="display:grid;gap:10px;">
                ${winners.best_roi        ? `<div style="display:flex;align-items:center;gap:10px;font-size:14px;">🏆 <strong>Best ROI:</strong> ${winners.best_roi}</div>` : ''}
                ${winners.fastest_payback ? `<div style="display:flex;align-items:center;gap:10px;font-size:14px;">⚡ <strong>Fastest Payback:</strong> ${winners.fastest_payback}</div>` : ''}
                ${winners.lowest_cost     ? `<div style="display:flex;align-items:center;gap:10px;font-size:14px;">💰 <strong>Lowest Cost:</strong> ${winners.lowest_cost}</div>` : ''}
                ${winners.highest_salary  ? `<div style="display:flex;align-items:center;gap:10px;font-size:14px;">💵 <strong>Highest Salary:</strong> ${winners.highest_salary}</div>` : ''}
            </div>
        </div>
    </div>`;

    const chartsHTML = `
    <div class="card" style="margin-top:20px;">
        <div class="card-header"><h3 class="card-title">Visual Comparison</h3></div>
        <div class="card-body">
            <div class="chart-grid">
                <div class="chart-card"><div class="chart-title">ROI (5 Years)</div><div style="height:280px;"><canvas id="compROI"></canvas></div></div>
                <div class="chart-card"><div class="chart-title">Payback Period (Years)</div><div style="height:280px;"><canvas id="compPayback"></canvas></div></div>
            </div>
            <div class="chart-grid" style="margin-top:16px;">
                <div class="chart-card"><div class="chart-title">Starting Salary</div><div style="height:280px;"><canvas id="compSalary"></canvas></div></div>
                <div class="chart-card"><div class="chart-title">Cost vs 5-Year Earnings</div><div style="height:280px;"><canvas id="compCostEarnings"></canvas></div></div>
            </div>
        </div>
    </div>`;

    const hasExtra = courses.some(c => c.course_data);
    const extraHTML = hasExtra ? `
    <div class="card" style="margin-top:20px;">
        <div class="card-header"><h3 class="card-title">Career Metrics Comparison</h3></div>
        <div class="card-body">
            <div class="chart-grid">
                <div class="chart-card"><div class="chart-title">Employment Rate (%)</div><div style="height:280px;"><canvas id="compEmployment"></canvas></div></div>
                <div class="chart-card"><div class="chart-title">Graduate Satisfaction (/5)</div><div style="height:280px;"><canvas id="compSatisfaction"></canvas></div></div>
            </div>
            <div class="chart-grid" style="margin-top:16px;">
                <div class="chart-card"><div class="chart-title">Job Security (/5)</div><div style="height:280px;"><canvas id="compJobSecurity"></canvas></div></div>
                <div class="chart-card"><div class="chart-title">Work-Life Balance (/5)</div><div style="height:280px;"><canvas id="compWorkLife"></canvas></div></div>
            </div>
        </div>
    </div>` : '';

    const cardsHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:20px;">
        ${courses.map(c => {
            const isWinner = Object.values(winners).includes(c.course_name);
            return `
            <div class="card" style="${isWinner ? 'border:2px solid var(--emerald);' : ''}">
                <div class="card-body">
                    <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border);">
                        <h4 style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:3px;">
                            ${c.course_name}
                            ${isWinner ? '<span class="badge badge-success" style="width:auto;display:inline-flex;margin-left:8px;font-size:11px;">WINNER</span>' : ''}
                        </h4>
                        <p style="font-size:13px;color:var(--text-3);">${c.university}</p>
                    </div>
                    ${[
                        ['Total Cost',      `€${c.total_cost.toLocaleString()}`,       c.course_name === winners.lowest_cost],
                        ['Starting Salary', `€${c.starting_salary.toLocaleString()}`,  c.course_name === winners.highest_salary],
                        ['After 5 Years',   `€${c.salary_after_5_years.toLocaleString()}`, false],
                        ['Payback Period',  `${c.payback_years.toFixed(1)} years`,     c.course_name === winners.fastest_payback],
                        ['5-Year ROI',      `${c.roi_5_years}%`,                       c.course_name === winners.best_roi],
                    ].map(([label, val, highlight]) => `
                        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--bg);">
                            <span style="font-size:13px;color:var(--text-2);">${label}</span>
                            <span style="font-size:14px;font-weight:600;color:${highlight ? 'var(--emerald-dk)' : 'var(--text)'};">${val}</span>
                        </div>`).join('')}
                    ${c.analysis ? `
                    <div style="display:flex;gap:8px;margin-top:14px;">
                        <span class="badge ${c.analysis.payback_emoji === '🟢' ? 'badge-success' : 'badge-warning'}" style="width:auto;display:inline-flex;">${c.analysis.payback_label}</span>
                        <span class="badge badge-info" style="width:auto;display:inline-flex;">${c.analysis.roi_rating} ROI</span>
                    </div>` : ''}
                </div>
            </div>`;
        }).join('')}
    </div>`;

    const el = document.getElementById('comparisonResults');
    el.innerHTML = winnersHTML + chartsHTML + extraHTML + cardsHTML;
    el.style.display = 'block';
    requestAnimationFrame(() => buildComparisonCharts(courses));
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildComparisonCharts(courses) {
    const labels = courses.map(c => c.course_name.split(' - ')[0]);
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#7c3aed'];
    const opts   = (yFmt, ttFmt) => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ttFmt(ctx.parsed.y) } },
        },
        scales: {
            y: { beginAtZero: true, ticks: { callback: yFmt, font: { size: 12 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
            x: { grid: { display: false }, ticks: { font: { size: 12 } } },
        },
    });

    const bar = (id, data, yFmt, ttFmt) => {
        const c = document.getElementById(id);
        if (!c) return;
        new Chart(c, {
            type: 'bar',
            data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, courses.length), borderRadius: 8 }] },
            options: opts(yFmt, ttFmt),
        });
    };

    bar('compROI',     courses.map(c => c.roi_5_years),    v => v + '%',              v => v + '% ROI');
    bar('compPayback', courses.map(c => c.payback_years),  v => v + 'y',              v => v.toFixed(1) + ' years');
    bar('compSalary',  courses.map(c => c.starting_salary),v => '€' + (v/1000) + 'k',v => '€' + v.toLocaleString());

    // Grouped: cost vs earnings
    const ce = document.getElementById('compCostEarnings');
    if (ce) {
        new Chart(ce, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Total Cost',       data: courses.map(c => c.total_cost),             backgroundColor: 'rgba(239,68,68,0.75)',  borderRadius: 6 },
                    { label: '5-Year Earnings',  data: courses.map(c => c.annual_net_income * 5),  backgroundColor: 'rgba(16,185,129,0.75)', borderRadius: 6 },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': €' + ctx.parsed.y.toLocaleString() } } },
                scales: { y: { beginAtZero: true, ticks: { callback: v => '€' + (v/1000) + 'k' } }, x: { grid: { display: false } } },
            },
        });
    }

    // Extra stats charts
    if (courses.some(c => c.course_data)) {
        bar('compEmployment',  courses.map(c => c.course_data?.employment_rate || 0),       v => v + '%',  v => v + '%');
        bar('compSatisfaction',courses.map(c => c.course_data?.graduate_satisfaction || 0), v => v + '/5', v => v + '/5');
        bar('compJobSecurity', courses.map(c => c.course_data?.job_security || 0),          v => v + '/5', v => v + '/5');
        bar('compWorkLife',    courses.map(c => c.course_data?.work_life_balance || 0),     v => v + '/5', v => v + '/5');
    }
}
