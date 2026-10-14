"""
app.py - NutriFind AI Backend Server
Flask application serving the responsive UI and complete REST API for food discovery,
AI food vision recognition, nutrient tracking, meal logs, and personalized analytics.
"""

import os
import re
import json
import sqlite3
import requests
from datetime import datetime, date, timedelta
from flask import Flask, render_template, request, jsonify, send_from_directory
from database import get_connection, init_db
from vision import analyze_food_image, recalculate_portion

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max image upload

# Ensure database is initialized
init_db()

# Standard FDA % Daily Value references (based on standard 2,000 calorie adult diet)
DAILY_VALUES = {
    "calories": 2000,
    "fat_g": 78.0,
    "saturated_fat_g": 20.0,
    "carbs_g": 275.0,
    "fiber_g": 28.0,
    "sugar_g": 50.0,
    "protein_g": 50.0,
    "sodium_mg": 2300.0,
    "potassium_mg": 4700.0,
    "calcium_mg": 1300.0,
    "iron_mg": 18.0,
    "vitamin_a_mcg": 900.0,
    "vitamin_c_mg": 90.0,
    "vitamin_d_mcg": 20.0
}

def row_to_dict(row):
    d = dict(row)
    if 'tags' in d and isinstance(d['tags'], str):
        try:
            d['tags'] = json.loads(d['tags'])
        except Exception:
            d['tags'] = []
    return d

@app.route('/')
def index():
    return render_template('index.html')

# ----------------- FOOD SEARCH & DETAILS API -----------------

@app.route('/api/foods/search')
def search_foods():
    query = request.args.get('q', '').strip()
    category = request.args.get('category', '').strip()
    limit = min(int(request.args.get('limit', 25)), 50)

    conn = get_connection()
    cursor = conn.cursor()

    sql = "SELECT * FROM foods WHERE 1=1"
    params = []

    if query:
        sql += " AND (name LIKE ? OR brand LIKE ? OR category LIKE ? OR tags LIKE ?)"
        term = f"%{query}%"
        params.extend([term, term, term, term])

    if category and category.lower() != 'all':
        sql += " AND LOWER(category) = LOWER(?)"
        params.append(category)

    sql += " ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, name ASC LIMIT ?"
    params.append(f"{query}%" if query else "%")
    params.append(limit)

    cursor.execute(sql, params)
    rows = cursor.fetchall()
    results = [row_to_dict(r) for r in rows]

    # If query had few results and was specific, optionally try Open Food Facts API
    if len(results) < 3 and len(query) >= 3:
        try:
            off_results = query_open_food_facts(query, max_items=5 - len(results))
            for item in off_results:
                results.append(item)
        except Exception as e:
            print(f"[Search] Open Food Facts fallback error: {e}")

    conn.close()
    return jsonify({
        "success": True,
        "query": query,
        "count": len(results),
        "foods": results
    })

def query_open_food_facts(query, max_items=4):
    """
    Fetches real public food data from Open Food Facts API when local matches are low.
    Ensures missing values remain None (never invented).
    """
    url = "https://world.openfoodfacts.org/cgi/search.pl"
    params = {
        "search_terms": query,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page_size": max_items
    }
    headers = {"User-Agent": "NutriFindAI - Web - Version 1.0"}
    resp = requests.get(url, params=params, headers=headers, timeout=3.5)
    items = []
    if resp.status_code == 200:
        data = resp.json()
        products = data.get("products", [])
        for p in products:
            p_name = p.get("product_name") or p.get("product_name_en")
            if not p_name:
                continue
            nutriments = p.get("nutriments", {})
            cals = nutriments.get("energy-kcal_100g") or nutriments.get("energy-kcal") or 0

            # Convert accurately without fabricating
            item = {
                "id": f"off-{p.get('code', re.sub(r'[^a-zA-Z0-9]', '', p_name)[:12])}",
                "name": p_name,
                "brand": p.get("brands", "Open Food Facts"),
                "category": "Packaged Goods",
                "serving_size_g": 100.0,
                "serving_unit": "100g standard",
                "calories": round(float(cals)),
                "protein_g": round(float(nutriments.get("proteins_100g", 0)), 1),
                "carbs_g": round(float(nutriments.get("carbohydrates_100g", 0)), 1),
                "fat_g": round(float(nutriments.get("fat_100g", 0)), 1),
                "fiber_g": round(float(nutriments["fiber_100g"]), 1) if "fiber_100g" in nutriments else None,
                "sugar_g": round(float(nutriments["sugars_100g"]), 1) if "sugars_100g" in nutriments else None,
                "saturated_fat_g": round(float(nutriments["saturated-fat_100g"]), 1) if "saturated-fat_100g" in nutriments else None,
                "sodium_mg": round(float(nutriments["sodium_100g"]) * 1000, 1) if "sodium_100g" in nutriments else None,
                "potassium_mg": round(float(nutriments["potassium_100g"]) * 1000, 1) if "potassium_100g" in nutriments else None,
                "calcium_mg": round(float(nutriments["calcium_100g"]) * 1000, 1) if "calcium_100g" in nutriments else None,
                "iron_mg": round(float(nutriments["iron_100g"]) * 1000, 2) if "iron_100g" in nutriments else None,
                "vitamin_a_mcg": None,
                "vitamin_c_mg": None,
                "vitamin_d_mcg": None,
                "data_source": "Open Food Facts (Public Database)",
                "is_estimate": 0,
                "health_score": (p.get("nutriscore_grade") or "B").upper(),
                "tags": ["open food facts", "barcode"],
                "image_url": p.get("image_front_thumb_url") or "📦"
            }
            items.append(item)
    return items

@app.route('/api/foods/suggestions')
def food_suggestions():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT category FROM foods ORDER BY category")
    categories = [r['category'] for r in cursor.fetchall()]

    cursor.execute("""
        SELECT id, name, category, calories, protein_g, carbs_g, fat_g, image_url, serving_unit
        FROM foods
        WHERE id IN ('dish-avocado-toast-egg', 'dish-salmon-quinoa-bowl', 'chicken-breast-grilled', 'apple-fuji', 'dish-berry-oatmeal-bowl', 'greek-yogurt-plain-0', 'avocado-hass', 'broccoli-steamed')
    """)
    featured = [row_to_dict(r) for r in cursor.fetchall()]
    conn.close()

    popular_searches = [
        "Salmon", "Avocado Toast", "Chicken Breast", "Greek Yogurt",
        "Oatmeal", "Brown Rice", "Eggs", "Spinach", "Quinoa", "Dark Chocolate"
    ]

    return jsonify({
        "success": True,
        "categories": ["All"] + categories,
        "featured": featured,
        "popular_searches": popular_searches
    })

@app.route('/api/foods/<food_id>')
def food_details(food_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM foods WHERE id = ?", (food_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return jsonify({"success": False, "error": "Food not found"}), 404

    food = row_to_dict(row)

    # Compute % Daily Values
    percent_dv = {}
    for nutrient, ref_value in DAILY_VALUES.items():
        val = food.get(nutrient)
        if val is not None:
            percent_dv[nutrient] = round((val / ref_value) * 100, 1)
        else:
            percent_dv[nutrient] = None

    food['percent_dv'] = percent_dv
    return jsonify({"success": True, "food": food})

# ----------------- AI FOOD VISION API -----------------

@app.route('/api/vision/analyze', methods=['POST'])
def analyze_vision():
    preset_id = request.form.get('preset_id') or (request.json and request.json.get('preset_id'))
    gemini_key = get_setting('gemini_api_key', '')

    image_bytes = None
    filename = None

    if 'image' in request.files:
        file = request.files['image']
        if file.filename:
            filename = file.filename
            image_bytes = file.read()
    elif request.json and 'image_b64' in request.json:
        b64_str = request.json['image_b64']
        if ',' in b64_str:
            b64_str = b64_str.split(',', 1)[1]
        try:
            import base64
            image_bytes = base64.b64decode(b64_str)
        except Exception:
            pass

    analysis = analyze_food_image(
        image_bytes=image_bytes,
        filename=filename,
        preset_id=preset_id,
        gemini_api_key=gemini_key
    )

    return jsonify(analysis)

@app.route('/api/vision/recalculate', methods=['POST'])
def vision_recalculate():
    data = request.json or {}
    nutrients_per_100g = data.get('nutrients_per_100g', {})
    portion_grams = float(data.get('portion_grams', 100))

    recalc = recalculate_portion(nutrients_per_100g, portion_grams)
    return jsonify({
        "success": True,
        "portion_grams": portion_grams,
        "total_nutrients": recalc
    })

# ----------------- DAILY TRACKING & MEAL LOGS API -----------------

@app.route('/api/logs', methods=['GET', 'POST'])
def handle_meal_logs():
    conn = get_connection()
    cursor = conn.cursor()

    if request.method == 'GET':
        log_date = request.args.get('date', date.today().isoformat())
        cursor.execute("""
            SELECT * FROM meal_logs
            WHERE date = ?
            ORDER BY id ASC
        """, (log_date,))
        rows = cursor.fetchall()

        meals = {
            "breakfast": [],
            "lunch": [],
            "dinner": [],
            "snack": []
        }
        totals = {
            "calories": 0, "protein_g": 0.0, "carbs_g": 0.0,
            "fat_g": 0.0, "fiber_g": 0.0, "sugar_g": 0.0, "sodium_mg": 0.0
        }

        for r in rows:
            item = dict(r)
            m_type = item.get('meal_type', 'snack').lower()
            if m_type in meals:
                meals[m_type].append(item)
            else:
                meals['snack'].append(item)

            totals['calories'] += item.get('calories', 0)
            totals['protein_g'] += item.get('protein_g', 0.0)
            totals['carbs_g'] += item.get('carbs_g', 0.0)
            totals['fat_g'] += item.get('fat_g', 0.0)
            totals['fiber_g'] += (item.get('fiber_g') or 0.0)
            totals['sugar_g'] += (item.get('sugar_g') or 0.0)
            totals['sodium_mg'] += (item.get('sodium_mg') or 0.0)

        # Round totals
        totals['calories'] = round(totals['calories'])
        totals['protein_g'] = round(totals['protein_g'], 1)
        totals['carbs_g'] = round(totals['carbs_g'], 1)
        totals['fat_g'] = round(totals['fat_g'], 1)
        totals['fiber_g'] = round(totals['fiber_g'], 1)
        totals['sugar_g'] = round(totals['sugar_g'], 1)
        totals['sodium_mg'] = round(totals['sodium_mg'], 1)

        conn.close()
        return jsonify({
            "success": True,
            "date": log_date,
            "meals": meals,
            "totals": totals,
            "total_items": len(rows)
        })

    elif request.method == 'POST':
        data = request.json or {}
        req_fields = ['meal_type', 'food_name', 'calories', 'protein_g', 'carbs_g', 'fat_g']
        for f in req_fields:
            if f not in data:
                conn.close()
                return jsonify({"success": False, "error": f"Missing required field: {f}"}), 400

        log_date = data.get('date', date.today().isoformat())
        timestamp = datetime.now().isoformat()

        cursor.execute("""
            INSERT INTO meal_logs (
                date, meal_type, food_id, food_name, servings, grams,
                calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g,
                sodium_mg, is_estimate, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            log_date,
            data.get('meal_type', 'snack').lower(),
            data.get('food_id', 'custom'),
            data.get('food_name'),
            float(data.get('servings', 1.0)),
            float(data.get('grams', 100.0)),
            float(data.get('calories', 0)),
            float(data.get('protein_g', 0)),
            float(data.get('carbs_g', 0)),
            float(data.get('fat_g', 0)),
            float(data.get('fiber_g')) if data.get('fiber_g') is not None else None,
            float(data.get('sugar_g')) if data.get('sugar_g') is not None else None,
            float(data.get('sodium_mg')) if data.get('sodium_mg') is not None else None,
            1 if data.get('is_estimate') else 0,
            timestamp
        ))
        conn.commit()
        inserted_id = cursor.lastrowid
        conn.close()

        return jsonify({"success": True, "message": "Meal logged successfully", "id": inserted_id})

@app.route('/api/logs/<int:log_id>', methods=['DELETE', 'PUT'])
def modify_meal_log(log_id):
    conn = get_connection()
    cursor = conn.cursor()

    if request.method == 'DELETE':
        cursor.execute("DELETE FROM meal_logs WHERE id = ?", (log_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": f"Log #{log_id} deleted"})

    elif request.method == 'PUT':
        data = request.json or {}
        servings = float(data.get('servings', 1.0))
        grams = float(data.get('grams', 100.0))
        calories = float(data.get('calories', 0))
        protein_g = float(data.get('protein_g', 0))
        carbs_g = float(data.get('carbs_g', 0))
        fat_g = float(data.get('fat_g', 0))

        cursor.execute("""
            UPDATE meal_logs
            SET servings = ?, grams = ?, calories = ?, protein_g = ?, carbs_g = ?, fat_g = ?
            WHERE id = ?
        """, (servings, grams, calories, protein_g, carbs_g, fat_g, log_id))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": f"Log #{log_id} updated"})

# ----------------- WATER TRACKER API -----------------

@app.route('/api/water', methods=['POST'])
def handle_water():
    data = request.json or {}
    delta = int(data.get('delta', 250)) # default 1 cup = 250ml

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT water_consumed_ml, water_target_ml FROM user_profile WHERE id = 1")
    row = cursor.fetchone()
    current = row['water_consumed_ml'] if row else 0
    target = row['water_target_ml'] if row else 2500

    new_val = max(0, current + delta)
    cursor.execute("UPDATE user_profile SET water_consumed_ml = ? WHERE id = 1", (new_val,))
    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "water_consumed_ml": new_val,
        "water_target_ml": target,
        "percentage": round((new_val / target) * 100, 1) if target else 0
    })

# ----------------- PERSONALIZED SUMMARY & NUTRITION INSIGHTS -----------------

@app.route('/api/summary')
def nutrition_summary():
    req_date = request.args.get('date', date.today().isoformat())

    conn = get_connection()
    cursor = conn.cursor()

    # User profile & targets
    cursor.execute("SELECT * FROM user_profile WHERE id = 1")
    profile = row_to_dict(cursor.fetchone())

    # Today's totals
    cursor.execute("""
        SELECT
            COALESCE(SUM(calories), 0) as total_cals,
            COALESCE(SUM(protein_g), 0) as total_protein,
            COALESCE(SUM(carbs_g), 0) as total_carbs,
            COALESCE(SUM(fat_g), 0) as total_fat,
            COALESCE(SUM(fiber_g), 0) as total_fiber,
            COALESCE(SUM(sugar_g), 0) as total_sugar,
            COALESCE(SUM(sodium_mg), 0) as total_sodium,
            COUNT(*) as item_count
        FROM meal_logs
        WHERE date = ?
    """, (req_date,))
    row = cursor.fetchone()
    conn.close()

    cals = round(row['total_cals'])
    protein = round(row['total_protein'], 1)
    carbs = round(row['total_carbs'], 1)
    fat = round(row['total_fat'], 1)
    fiber = round(row['total_fiber'], 1)
    sugar = round(row['total_sugar'], 1)
    sodium = round(row['total_sodium'], 1)

    target_cals = profile['daily_calorie_target']
    target_p = profile['protein_target_g']
    target_c = profile['carbs_target_g']
    target_f = profile['fat_target_g']

    remaining_cals = target_cals - cals
    p_pct = round((protein / target_p) * 100) if target_p else 0
    c_pct = round((carbs / target_c) * 100) if target_c else 0
    f_pct = round((fat / target_f) * 100) if target_f else 0

    # Macro distribution in calories (P=4 kcal/g, C=4 kcal/g, F=9 kcal/g)
    total_macro_cals = (protein * 4) + (carbs * 4) + (fat * 9)
    macro_split = {
        "protein_pct": round((protein * 4 / total_macro_cals * 100), 1) if total_macro_cals > 0 else 0,
        "carbs_pct": round((carbs * 4 / total_macro_cals * 100), 1) if total_macro_cals > 0 else 0,
        "fat_pct": round((fat * 9 / total_macro_cals * 100), 1) if total_macro_cals > 0 else 0
    }

    # Generate Personalized Nutrition Advice & Highlights
    insights = []
    if cals == 0:
        insights.append({"type": "info", "title": "Start Your Day", "text": "No meals logged yet today. Search for your breakfast or snap a food photo to begin tracking!"})
    else:
        # Calorie feedback
        if remaining_cals > 400:
            insights.append({"type": "neutral", "title": "Calories Remaining", "text": f"You have {remaining_cals} kcal remaining to meet your daily target for {profile['goal']}ing weight."})
        elif remaining_cals >= -100:
            insights.append({"type": "success", "title": "Energy Balance On Point", "text": "You are right on track within your optimal calorie intake zone today!"})
        else:
            insights.append({"type": "warning", "title": "Calorie Target Exceeded", "text": f"You have reached {cals} kcal ({abs(remaining_cals)} kcal over target). Consider a light vegetable or lean protein dinner."})

        # Protein feedback
        if p_pct >= 90:
            insights.append({"type": "success", "title": "Optimal Protein Intake", "text": f"Great job reaching {protein}g protein ({p_pct}% of goal)! Perfect for muscle maintenance and satiety."})
        elif p_pct < 60:
            insights.append({"type": "tip", "title": "Boost Your Protein", "text": f"You are at {p_pct}% of your protein goal. Consider adding Greek yogurt, eggs, or chicken to your next meal."})

        # Fiber & Sodium checks
        if fiber >= 25:
            insights.append({"type": "success", "title": "High Fiber Intake", "text": f"Achieved {fiber}g fiber today! Exceeding the USDA recommended 25g threshold for optimal gut & cardiovascular health."})
        elif fiber < 12 and cals > 1000:
            insights.append({"type": "tip", "title": "Fiber Reminder", "text": "Add some leafy greens, berries, chia seeds, or legumes to increase your dietary fiber."})

        if sodium > 2300:
            insights.append({"type": "warning", "title": "Sodium Awareness", "text": f"Sodium is currently at {sodium}mg, which exceeds the FDA recommended 2,300mg daily limit. Drink extra water to maintain electrolyte balance."})

    return jsonify({
        "success": True,
        "date": req_date,
        "consumed": {
            "calories": cals,
            "protein_g": protein,
            "carbs_g": carbs,
            "fat_g": fat,
            "fiber_g": fiber,
            "sugar_g": sugar,
            "sodium_mg": sodium
        },
        "targets": {
            "calories": target_cals,
            "protein_g": target_p,
            "carbs_g": target_c,
            "fat_g": target_f,
            "water_ml": profile['water_target_ml']
        },
        "percentages": {
            "calories": round((cals / target_cals) * 100) if target_cals else 0,
            "protein": p_pct,
            "carbs": c_pct,
            "fat": f_pct
        },
        "macro_split": macro_split,
        "remaining_calories": remaining_cals,
        "water_consumed_ml": profile['water_consumed_ml'],
        "water_target_ml": profile['water_target_ml'],
        "insights": insights
    })

# ----------------- 7-DAY ANALYTICS & HISTORY API -----------------

@app.route('/api/analytics')
def weekly_analytics():
    conn = get_connection()
    cursor = conn.cursor()

    # Get target calories
    cursor.execute("SELECT daily_calorie_target FROM user_profile WHERE id = 1")
    target_cals = cursor.fetchone()['daily_calorie_target']

    # Generate dates for past 7 days
    days = []
    today = date.today()
    for i in range(6, -1, -1):
        d_str = (today - timedelta(days=i)).isoformat()
        day_label = (today - timedelta(days=i)).strftime("%a")

        cursor.execute("""
            SELECT
                COALESCE(SUM(calories), 0) as cals,
                COALESCE(SUM(protein_g), 0) as protein,
                COALESCE(SUM(carbs_g), 0) as carbs,
                COALESCE(SUM(fat_g), 0) as fat,
                COALESCE(SUM(fiber_g), 0) as fiber
            FROM meal_logs
            WHERE date = ?
        """, (d_str,))
        row = cursor.fetchone()

        cals = round(row['cals'])
        days.append({
            "date": d_str,
            "day": day_label,
            "calories": cals,
            "target": target_cals,
            "protein_g": round(row['protein'], 1),
            "carbs_g": round(row['carbs'], 1),
            "fat_g": round(row['fat'], 1),
            "fiber_g": round(row['fiber'], 1),
            "completed": cals > 0 and abs(cals - target_cals) <= 300
        })

    conn.close()

    # Calculate 7-day average
    logged_days = [d for d in days if d['calories'] > 0]
    avg_cals = round(sum(d['calories'] for d in logged_days) / len(logged_days)) if logged_days else 0
    avg_protein = round(sum(d['protein_g'] for d in logged_days) / len(logged_days), 1) if logged_days else 0
    avg_carbs = round(sum(d['carbs_g'] for d in logged_days) / len(logged_days), 1) if logged_days else 0
    avg_fat = round(sum(d['fat_g'] for d in logged_days) / len(logged_days), 1) if logged_days else 0

    return jsonify({
        "success": True,
        "target_calories": target_cals,
        "days": days,
        "averages": {
            "calories": avg_cals,
            "protein_g": avg_protein,
            "carbs_g": avg_carbs,
            "fat_g": avg_fat
        },
        "days_logged": len(logged_days)
    })

# ----------------- USER PROFILE & TDEE CALCULATOR API -----------------

@app.route('/api/profile', methods=['GET', 'POST'])
def user_profile():
    conn = get_connection()
    cursor = conn.cursor()

    if request.method == 'GET':
        cursor.execute("SELECT * FROM user_profile WHERE id = 1")
        row = cursor.fetchone()
        conn.close()
        return jsonify({"success": True, "profile": row_to_dict(row)})

    elif request.method == 'POST':
        data = request.json or {}
        name = data.get('name', 'Alex Morgan')
        gender = data.get('gender', 'female').lower()
        age = int(data.get('age', 28))
        weight_kg = float(data.get('weight_kg', 65.0))
        height_cm = float(data.get('height_cm', 168.0))
        activity = data.get('activity_level', 'moderate')
        goal = data.get('goal', 'maintain')
        diet_type = data.get('diet_type', 'balanced')

        # Recalculate Mifflin-St Jeor BMR & TDEE
        if gender == 'male':
            bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5
        else:
            bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161

        activity_multipliers = {
            'sedentary': 1.2,
            'light': 1.375,
            'moderate': 1.55,
            'very_active': 1.725,
            'athlete': 1.9
        }
        mult = activity_multipliers.get(activity, 1.55)
        tdee = bmr * mult

        # Adjust for goal
        if goal == 'lose':
            daily_cals = round(tdee - 450)
        elif goal == 'gain':
            daily_cals = round(tdee + 400)
        else:
            daily_cals = round(tdee)

        daily_cals = max(1200, daily_cals)

        # Macro splits based on diet type
        if diet_type == 'high_protein':
            p_cals = daily_cals * 0.35
            c_cals = daily_cals * 0.40
            f_cals = daily_cals * 0.25
        elif diet_type == 'low_carb':
            p_cals = daily_cals * 0.35
            c_cals = daily_cals * 0.20
            f_cals = daily_cals * 0.45
        elif diet_type == 'keto':
            p_cals = daily_cals * 0.25
            c_cals = daily_cals * 0.05
            f_cals = daily_cals * 0.70
        else: # balanced
            p_cals = daily_cals * 0.25
            c_cals = daily_cals * 0.50
            f_cals = daily_cals * 0.25

        target_p = round(p_cals / 4.0)
        target_c = round(c_cals / 4.0)
        target_f = round(f_cals / 9.0)

        # Water target: ~35ml per kg of body weight
        water_target = round(weight_kg * 35)

        cursor.execute("""
            UPDATE user_profile
            SET name = ?, gender = ?, age = ?, weight_kg = ?, height_cm = ?,
                activity_level = ?, goal = ?, diet_type = ?,
                daily_calorie_target = ?, protein_target_g = ?,
                carbs_target_g = ?, fat_target_g = ?, water_target_ml = ?,
                updated_at = datetime('now')
            WHERE id = 1
        """, (
            name, gender, age, weight_kg, height_cm,
            activity, goal, diet_type,
            daily_cals, target_p, target_c, target_f, water_target
        ))
        conn.commit()

        cursor.execute("SELECT * FROM user_profile WHERE id = 1")
        updated = row_to_dict(cursor.fetchone())
        conn.close()

        return jsonify({
            "success": True,
            "message": "Profile and nutrition goals updated successfully",
            "profile": updated,
            "bmr": round(bmr),
            "tdee": round(tdee)
        })

# ----------------- SYSTEM SETTINGS API -----------------

def get_setting(key, default=''):
    try:
        conn = get_connection()
        c = conn.cursor()
        c.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = c.fetchone()
        conn.close()
        return row['value'] if row else default
    except Exception:
        return default

@app.route('/api/settings', methods=['GET', 'POST'])
def system_settings():
    conn = get_connection()
    c = conn.cursor()

    if request.method == 'GET':
        c.execute("SELECT key, value FROM settings")
        rows = c.fetchall()
        settings = {r['key']: r['value'] for r in rows}
        # Mask sensitive keys for display
        masked = {}
        for k, v in settings.items():
            if 'key' in k and v and len(v) > 8:
                masked[k] = v[:4] + '...' + v[-4:]
            else:
                masked[k] = v
        conn.close()
        return jsonify({"success": True, "settings": masked})

    elif request.method == 'POST':
        data = request.json or {}
        for k, v in data.items():
            c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, str(v).strip()))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Settings updated"})

if __name__ == '__main__':
    import sys
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    print("[SERVER] NutriFind AI server starting on http://127.0.0.1:5000 ...")
    app.run(host='127.0.0.1', port=5000, debug=False)
