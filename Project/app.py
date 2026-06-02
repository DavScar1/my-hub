from flask import Flask, request, jsonify, send_file
import sys
import os
import traceback
import json as json_module

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'logic'))

try:
    from roi_calculator import calculate_roi, get_available_courses
    from course_data import COURSE_DATA
except ImportError as e:
    print(f"Error importing modules: {e}")
    sys.exit(1)

app = Flask(__name__, static_folder='.')

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin', '')
    response.headers['Access-Control-Allow-Origin'] = origin or '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return response

@app.route('/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    return '', 204

# ---------------------------------------------------------------------------
# Module-level cache  (computed once on first request, reused for all)
# ---------------------------------------------------------------------------

_cache = {
    'bulk_data': None,   # dict[course_name -> result dict]
    'avg_roi': None,
    'avg_payback': None,
}

COURSE_DATA_FIELDS = [
    'employment_rate', 'graduate_satisfaction', 'job_security',
    'work_life_balance', 'career_progression', 'top_employers',
    'typical_roles', 'skills_demand', 'remote_work_availability',
    'further_study_rate', 'international_opportunities',
    'industry_growth_rate', 'avg_class_size', 'internship_opportunities',
    'startup_salary_range',
]


def _build_cache():
    bulk = {}
    rois, paybacks = [], []

    for name in COURSE_DATA.keys():
        try:
            result = calculate_roi(name)
            result = analyze_course(result)

            cd = COURSE_DATA[name]
            result['course_data'] = {k: cd.get(k) for k in COURSE_DATA_FIELDS}

            rois.append(result['roi_5_years'])
            paybacks.append(result['payback_years'])
            bulk[name] = result
        except Exception as e:
            print(f"Warning: could not cache {name}: {e}")

    avg_roi = sum(rois) / len(rois) if rois else 0
    avg_payback = sum(paybacks) / len(paybacks) if paybacks else 0

    for result in bulk.values():
        _attach_comparison(result, avg_roi, avg_payback)

    _cache['bulk_data'] = bulk
    _cache['avg_roi'] = avg_roi
    _cache['avg_payback'] = avg_payback


def get_cache():
    if _cache['bulk_data'] is None:
        _build_cache()
    return _cache


def _attach_comparison(result, avg_roi, avg_payback):
    roi_diff = ((result['roi_5_years'] - avg_roi) / avg_roi * 100) if avg_roi else 0
    payback_diff = ((avg_payback - result['payback_years']) / avg_payback * 100) if avg_payback else 0

    roi_status = 'above' if roi_diff > 20 else ('below' if roi_diff < -20 else 'average')
    roi_emoji = '📈' if roi_status == 'above' else ('📉' if roi_status == 'below' else '📊')

    payback_status = 'faster' if payback_diff > 15 else ('slower' if payback_diff < -15 else 'average')
    payback_emoji = '⚡' if payback_status == 'faster' else ('⏱️' if payback_status == 'slower' else '📊')

    result['comparison'] = {
        'roi_diff': round(abs(roi_diff), 0),
        'roi_status': roi_status,
        'roi_emoji': roi_emoji,
        'payback_diff': round(abs(payback_diff), 0),
        'payback_status': payback_status,
        'payback_emoji': payback_emoji,
        'avg_roi': round(avg_roi, 1),
        'avg_payback': round(avg_payback, 1),
    }

# ---------------------------------------------------------------------------
# Analysis helpers (unchanged logic, same as before)
# ---------------------------------------------------------------------------

def analyze_course(result):
    payback = result['payback_years']
    if payback < 1.5:
        payback_label, payback_emoji, payback_description = 'Fast payback', '🟢', "You'll recover your investment quickly"
    elif payback < 2.5:
        payback_label, payback_emoji, payback_description = 'Medium payback', '🟡', 'Reasonable time to recover investment'
    else:
        payback_label, payback_emoji, payback_description = 'Slow payback', '🔴', 'Takes longer to recover investment'

    roi = result['roi_5_years']
    if roi > 400:
        roi_rating, roi_stars, roi_emoji = 'Excellent', 5, '⭐⭐⭐⭐⭐'
    elif roi > 300:
        roi_rating, roi_stars, roi_emoji = 'Very Good', 4, '⭐⭐⭐⭐'
    elif roi > 200:
        roi_rating, roi_stars, roi_emoji = 'Good', 3, '⭐⭐⭐'
    else:
        roi_rating, roi_stars, roi_emoji = 'Fair', 2, '⭐⭐'

    course_type = result['course_name'].split(' - ')[0]
    if roi > 400 and payback < 1.5:
        recommendation = 'One of the best investments in Irish education. Fast payback and excellent returns.'
    elif course_type == 'Medicine':
        recommendation = 'Longer course (6 years) but strong career prospects. High lifetime earnings potential.'
    elif payback < 1.2:
        recommendation = 'Fastest payback in our analysis. You\'ll recover your investment quickly.'
    elif roi > 500:
        recommendation = 'Outstanding ROI. High demand field with strong salary growth.'
    elif payback > 2:
        recommendation = 'Slower to recover investment, but still provides positive returns over time.'
    else:
        recommendation = f'Solid choice with {payback_label.lower()} and {roi_rating.lower()} ROI.'

    career_years = 30
    year_5_salary = result['salary_after_5_years']
    lifetime_earnings = (result['starting_salary'] + year_5_salary) / 2 * 5
    for year in range(6, career_years + 1):
        lifetime_earnings += year_5_salary * (1.03 ** (year - 5))

    lifetime_profit = lifetime_earnings - result['total_cost']
    lifetime_roi = (lifetime_profit / result['total_cost']) * 100
    times_earned_back = lifetime_earnings / result['total_cost']

    result['analysis'] = {
        'payback_label': payback_label,
        'payback_emoji': payback_emoji,
        'payback_description': payback_description,
        'roi_rating': roi_rating,
        'roi_stars': roi_stars,
        'roi_emoji': roi_emoji,
        'recommendation': recommendation,
        'lifetime': {
            'total_earnings': round(lifetime_earnings, 0),
            'profit': round(lifetime_profit, 0),
            'roi': round(lifetime_roi, 0),
            'times_earned_back': round(times_earned_back, 1),
        },
    }
    return result


def suggest_alternative(result, bulk):
    try:
        current_course = result['course_name']
        course_field = current_course.split(' - ')[0]
        current_roi = result['roi_5_years']
        current_cost = result['total_cost']

        similar = [
            v for k, v in bulk.items()
            if course_field in k and k != current_course
        ][:3]

        suggestions = []
        for s in similar:
            if s['roi_5_years'] > current_roi * 1.1:
                suggestions.append({
                    'course': s['course_name'],
                    'reason': f"has {s['roi_5_years'] - current_roi:.0f}% higher ROI",
                    'priority': 'high',
                    'emoji': '🎯',
                })
            elif s['total_cost'] < current_cost * 0.9 and s['roi_5_years'] > current_roi * 0.95:
                cost_saving = current_cost - s['total_cost']
                suggestions.append({
                    'course': s['course_name'],
                    'reason': f"costs €{cost_saving:,.0f} less with similar ROI",
                    'priority': 'medium',
                    'emoji': '💰',
                })

        if not suggestions:
            result['suggestion'] = {
                'has_suggestion': False,
                'text': 'This is already one of the top options in this field.',
                'emoji': '✅',
            }
        else:
            best = suggestions[0]
            result['suggestion'] = {
                'has_suggestion': True,
                'text': f"Consider '{best['course']}' — it {best['reason']}",
                'emoji': best['emoji'],
            }
    except Exception as e:
        print(f"Warning: could not generate suggestion: {e}")
        result['suggestion'] = None
    return result

# ---------------------------------------------------------------------------
# Routes — static files
# ---------------------------------------------------------------------------

@app.route('/')
def home():
    try:
        return send_file('index.html')
    except FileNotFoundError:
        return jsonify({'error': 'index.html not found'}), 404

@app.route('/calculator')
def calculator_page():
    return home()

@app.route('/quiz')
def quiz_page():
    try:
        return send_file('quiz.html')
    except FileNotFoundError:
        return jsonify({'error': 'quiz.html not found'}), 404

@app.route('/style.css')
def serve_css():
    try:
        return send_file('style.css', mimetype='text/css')
    except FileNotFoundError:
        return jsonify({'error': 'style.css not found'}), 404

@app.route('/script.js')
def serve_js():
    try:
        return send_file('script.js', mimetype='application/javascript')
    except FileNotFoundError:
        return jsonify({'error': 'script.js not found'}), 404

@app.route('/robots.txt')
def robots():
    return (
        'User-agent: *\nAllow: /\nSitemap: https://roicollege.ie/sitemap.xml',
        200,
        {'Content-Type': 'text/plain'},
    )

@app.route('/blog')
def blog_index():
    try:
        return send_file('blog/index.html')
    except FileNotFoundError:
        return 'Blog not found', 404

@app.route('/blog/<post_slug>')
def blog_post(post_slug):
    try:
        return send_file(f'blog/{post_slug}.html')
    except FileNotFoundError:
        return 'Post not found', 404

# ---------------------------------------------------------------------------
# Routes — API
# ---------------------------------------------------------------------------

@app.route('/api')
def api_status():
    return jsonify({
        'status': 'online',
        'message': 'Irish College ROI Calculator API',
        'version': '2.0.0',
        'endpoints': {
            '/': 'Calculator web interface',
            '/api': 'API status',
            '/courses': 'List all course names',
            '/courses-bulk': 'All courses with pre-calculated data (fast)',
            '/calculate': 'Calculate ROI for a specific course (GET ?course=NAME)',
            '/compare-multiple': 'Compare multiple courses (POST JSON)',
        },
        'total_courses': len(COURSE_DATA),
    })


@app.route('/courses')
def courses():
    try:
        course_list = get_available_courses()
        return jsonify({
            'success': True,
            'total_courses': len(course_list),
            'courses': sorted(course_list),
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/courses-bulk')
def courses_bulk():
    """Return all pre-calculated course data in a single request."""
    try:
        cache = get_cache()
        return jsonify({
            'success': True,
            'total_courses': len(cache['bulk_data']),
            'courses': list(cache['bulk_data'].values()),
            'avg_roi': cache['avg_roi'],
            'avg_payback': cache['avg_payback'],
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/calculate')
def calculate():
    course_name = request.args.get('course')
    if not course_name:
        return jsonify({
            'success': False,
            'error': "Missing 'course' parameter. Usage: /calculate?course=COURSE_NAME",
        }), 400

    custom_tuition = request.args.get('tuition', type=float)
    custom_years = request.args.get('years', type=int)

    try:
        result = calculate_roi(
            course_name=course_name,
            tuition_per_year=custom_tuition,
            course_length=custom_years,
        )
        result = analyze_course(result)

        cache = get_cache()
        _attach_comparison(result, cache['avg_roi'], cache['avg_payback'])
        result = suggest_alternative(result, cache['bulk_data'])

        if course_name in COURSE_DATA:
            cd = COURSE_DATA[course_name]
            result['course_data'] = {k: cd.get(k) for k in COURSE_DATA_FIELDS}

        return jsonify({'success': True, 'data': result})

    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Calculation failed: {str(e)}'}), 500


@app.route('/compare-multiple', methods=['POST', 'OPTIONS'])
def compare_multiple():
    if request.method == 'OPTIONS':
        return '', 204

    try:
        data = request.get_json()
        if not data or 'courses' not in data:
            return jsonify({'success': False, 'error': "Missing 'courses' in request body"}), 400

        course_list = data['courses']
        if not isinstance(course_list, list):
            return jsonify({'success': False, 'error': "'courses' must be an array"}), 400
        if len(course_list) < 2:
            return jsonify({'success': False, 'error': 'Provide at least 2 courses to compare'}), 400
        if len(course_list) > 5:
            return jsonify({'success': False, 'error': 'Maximum 5 courses can be compared'}), 400

        cache = get_cache()
        results, errors = [], []

        for name in course_list:
            try:
                result = calculate_roi(name)
                result = analyze_course(result)
                _attach_comparison(result, cache['avg_roi'], cache['avg_payback'])
                if name in COURSE_DATA:
                    cd = COURSE_DATA[name]
                    result['course_data'] = {k: cd.get(k) for k in [
                        'employment_rate', 'graduate_satisfaction', 'job_security',
                        'work_life_balance', 'industry_growth_rate', 'avg_class_size',
                        'internship_opportunities', 'skills_demand', 'remote_work_availability',
                    ]}
                results.append(result)
            except ValueError as e:
                errors.append({'course': name, 'error': str(e)})
            except Exception as e:
                errors.append({'course': name, 'error': f'Failed to calculate: {str(e)}'})

        if not results:
            return jsonify({'success': False, 'error': 'No valid courses found', 'errors': errors}), 400

        winners = {}
        if len(results) >= 2:
            winners = {
                'best_roi': max(results, key=lambda x: x['roi_5_years'])['course_name'],
                'fastest_payback': min(results, key=lambda x: x['payback_years'])['course_name'],
                'lowest_cost': min(results, key=lambda x: x['total_cost'])['course_name'],
                'highest_salary': max(results, key=lambda x: x['starting_salary'])['course_name'],
            }

        response = {
            'success': True,
            'total_compared': len(results),
            'courses': results,
            'winners': winners,
        }
        if errors:
            response['errors'] = errors
        return jsonify(response)

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Comparison failed: {str(e)}'}), 500

# ---------------------------------------------------------------------------
# SEO pages
# ---------------------------------------------------------------------------

@app.route('/course/<course_slug>')
def course_page(course_slug):
    course_name = None
    for name in COURSE_DATA.keys():
        slug = name.lower().replace(' - ', '-').replace(' ', '-')
        if slug == course_slug:
            course_name = name
            break

    if not course_name:
        return 'Course not found', 404

    result = calculate_roi(course_name)
    # Use json.dumps to safely escape the course name before embedding in JS
    safe_name = json_module.dumps(course_name)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{course_name} ROI Ireland | CollegeROI</title>
    <meta name="description" content="Is {course_name} worth it in Ireland? Starting salary €{result['starting_salary']:,}, 5-year ROI {result['roi_5_years']}%, payback in {result['payback_years']} years.">
    <script>
        localStorage.setItem('roi_calc_last_course', {safe_name});
        window.location.href = '/';
    </script>
</head>
</html>"""
    return html


@app.route('/all-courses')
def courses_index():
    links = ''
    for name in COURSE_DATA.keys():
        slug = name.lower().replace(' - ', '-').replace(' ', '-')
        links += f'<li><a href="/course/{slug}">{name}</a></li>\n'

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>All Irish College Courses ROI | CollegeROI</title>
    <meta name="description" content="Browse ROI, salary and employment data for every Irish college course.">
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <a href="/">← Back to Calculator</a>
    <h1>All Irish College Courses</h1>
    <ul>{links}</ul>
</body>
</html>"""

# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(404)
def not_found(e):
    return jsonify({
        'success': False,
        'error': 'Endpoint not found',
        'available_endpoints': ['/', '/api', '/courses', '/courses-bulk', '/calculate', '/compare-multiple'],
    }), 404

@app.errorhandler(500)
def server_error(e):
    traceback.print_exc()
    return jsonify({'success': False, 'error': 'Internal server error'}), 500

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    print('=' * 70)
    print('Irish College ROI Calculator — v2.0')
    print('=' * 70)
    print(f'\nLoaded {len(COURSE_DATA)} courses')
    print('Building course cache...')
    get_cache()
    print('Cache ready.')
    print('\nServer: http://127.0.0.1:5000')
    print('=' * 70)

    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, port=port, host='0.0.0.0')
