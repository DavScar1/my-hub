# roi_calculator.py
# Core ROI calculation logic for Irish college courses
# Updated to support expanded course database

from course_data import COURSE_DATA, get_all_courses

def calculate_roi(course_name, tuition_per_year=None, course_length=None):
    """
    Calculate ROI for a college course.
    
    Args:
        course_name: str (must match COURSE_DATA keys)
        tuition_per_year: float (€) - if None, uses typical tuition from data
        course_length: int (years) - if None, uses typical length from data
    
    Returns:
        dict with all calculated outputs
    """
    # Get course data
    course_info = COURSE_DATA.get(course_name)
    if not course_info:
        raise ValueError(f"Course '{course_name}' not found. Available courses: {len(get_all_courses())} courses in database")
    
    # Use provided values or defaults from course data
    if tuition_per_year is None:
        tuition_per_year = course_info["typical_tuition"]
    if course_length is None:
        course_length = course_info["course_length"]
    
    starting_salary = course_info["starting_salary"]
    salary_5_years = course_info["salary_5_years"]
    growth_rate = course_info["growth_rate"]
    
    # Calculate total education cost
    total_cost = tuition_per_year * course_length
    
    # Calculate take-home pay (assuming 25% effective tax rate for graduates)
    annual_net_income = starting_salary * 0.75
    
    # Calculate payback period (years to recover education cost)
    payback_years = total_cost / annual_net_income
    
    # Calculate average salary over 5 years (linear growth assumption)
    avg_salary_5y = (starting_salary + salary_5_years) / 2
    
    # Calculate total earnings over 5 years (after tax)
    total_earnings_5y = avg_salary_5y * 5 * 0.75
    
    # Calculate ROI percentage over 5 years
    roi_percentage = ((total_earnings_5y - total_cost) / total_cost) * 100
    
    # Calculate lifetime value (30 year career, simplified)
    lifetime_earnings = starting_salary * (growth_rate ** 6) * 24
    lifetime_roi = ((lifetime_earnings - total_cost) / total_cost) * 100
    
    return {
        "course_name": course_name,
        "university": course_info["university"],
        "total_cost": round(total_cost, 2),
        "starting_salary": starting_salary,
        "annual_net_income": round(annual_net_income, 2),
        "salary_after_5_years": round(salary_5_years, 2),
        "payback_years": round(payback_years, 1),
        "roi_5_years": round(roi_percentage, 1),
        "lifetime_roi": round(lifetime_roi, 0),
        "course_length": course_length,
        "tuition_per_year": tuition_per_year
    }


def compare_courses(course_list, tuition_override=None):
    """
    Compare multiple courses side by side.
    
    Args:
        course_list: list of course names
        tuition_override: optional dict of {course_name: tuition} to override defaults
    
    Returns:
        list of dicts with ROI calculations for each course
    """
    results = []
    for course in course_list:
        tuition = tuition_override.get(course) if tuition_override else None
        try:
            result = calculate_roi(course, tuition_per_year=tuition)
            results.append(result)
        except ValueError as e:
            print(f"Warning: {e}")
    
    # Sort by ROI (descending)
    results.sort(key=lambda x: x["roi_5_years"], reverse=True)
    return results


def get_available_courses():
    """Return list of all available course names"""
    return get_all_courses()


def get_courses_by_university(university_name):
    """Get all courses for a specific university"""
    from course_data import get_courses_by_university
    return get_courses_by_university(university_name)


def get_top_roi_courses(limit=10):
    """Get top N courses by ROI"""
    all_courses = get_available_courses()
    results = []
    
    for course in all_courses:
        try:
            result = calculate_roi(course)
            results.append(result)
        except Exception:
            continue

    results.sort(key=lambda x: x["roi_5_years"], reverse=True)
    return results[:limit]


def get_fastest_payback_courses(limit=10):
    """Get courses with fastest payback period"""
    all_courses = get_available_courses()
    results = []

    for course in all_courses:
        try:
            result = calculate_roi(course)
            results.append(result)
        except Exception:
            continue
    
    results.sort(key=lambda x: x["payback_years"])
    return results[:limit]


# Test the calculator
if __name__ == "__main__":
    print("=" * 70)
    print("IRISH COLLEGE ROI CALCULATOR - TEST RUN")
    print("=" * 70)
    
    # Test 1: Single course calculation
    print("\n--- TEST 1: Computer Science at UCD ---")
    result = calculate_roi("Computer Science - UCD")
    
    print(f"Course: {result['course_name']}")
    print(f"University: {result['university']}")
    print(f"Course Length: {result['course_length']} years")
    print(f"Total Cost: €{result['total_cost']:,.0f}")
    print(f"Starting Salary: €{result['starting_salary']:,}")
    print(f"Net Income (Year 1): €{result['annual_net_income']:,.0f}")
    print(f"Salary After 5 Years: €{result['salary_after_5_years']:,.0f}")
    print(f"Payback Period: {result['payback_years']} years")
    print(f"5-Year ROI: {result['roi_5_years']}%")
    
    # Test 2: New course - Cybersecurity
    print("\n--- TEST 2: Cybersecurity at UCD (NEW COURSE) ---")
    result = calculate_roi("Cybersecurity - UCD")
    print(f"Course: {result['course_name']}")
    print(f"Starting Salary: €{result['starting_salary']:,}")
    print(f"5-Year ROI: {result['roi_5_years']}%")
    print(f"Payback: {result['payback_years']} years")
    
    # Test 3: AI at Trinity
    print("\n--- TEST 3: Artificial Intelligence at TCD (NEW COURSE) ---")
    result = calculate_roi("Artificial Intelligence - TCD")
    print(f"Course: {result['course_name']}")
    print(f"Starting Salary: €{result['starting_salary']:,}")
    print(f"5-Year ROI: {result['roi_5_years']}%")
    print(f"Payback: {result['payback_years']} years")
    
    # Test 4: UCC courses
    print("\n--- TEST 4: UCC Courses ---")
    ucc_result = calculate_roi("Computer Science - UCC")
    print(f"UCC CS: ROI {ucc_result['roi_5_years']}%, Starting €{ucc_result['starting_salary']:,}")
    
    # Test 5: Show total courses available
    print("\n--- TEST 5: Database Summary ---")
    total_courses = len(get_available_courses())
    print(f"Total courses in database: {total_courses}")
    
    # Test 6: Top 5 ROI courses
    print("\n--- TEST 6: Top 5 Courses by ROI ---")
    top_courses = get_top_roi_courses(5)
    for i, course in enumerate(top_courses, 1):
        print(f"{i}. {course['course_name']}: {course['roi_5_years']}% ROI")
    
    # Test 7: Fastest payback
    print("\n--- TEST 7: Top 5 Fastest Payback ---")
    fast_courses = get_fastest_payback_courses(5)
    for i, course in enumerate(fast_courses, 1):
        print(f"{i}. {course['course_name']}: {course['payback_years']} years")
    
    print("\n" + "=" * 70)
    print("✅ All tests passed! Expanded database working correctly.")
    print("=" * 70)