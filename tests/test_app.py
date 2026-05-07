from tests.conftest import login


def test_index_loads(client):
    response = client.get("/")
    assert response.status_code == 200
    assert b"Veritas University" in response.data


def test_student_login_and_dashboard(client):
    response = login(client, "student@veritas.edu.ng", "student123")
    assert response.status_code == 200
    assert b"Demo Student" in response.data


def test_incomplete_student_can_reach_dashboard_after_login(client, app):
    app.data_repo.memory["users"].append(
        {
            "id": "student-incomplete",
            "name": "Incomplete Student",
            "email": "incomplete@veritas.edu.ng",
            "password": "student123",
            "role": "student",
            "preferred_language": "en",
            "phone": "",
            "department": "",
            "faculty": "",
            "level": "",
            "student_number": "",
            "created_at": "2026-04-28T00:00:00Z",
        }
    )
    response = login(client, "incomplete@veritas.edu.ng", "student123")
    assert response.status_code == 200
    assert b"Welcome back" in response.data


def test_login_page_defaults_to_signup_mode(client):
    response = client.get("/login")
    assert response.status_code == 200
    assert b"Create your student account" in response.data
    assert b"Forgot your password?" not in response.data


def test_login_mode_shows_login_form_and_forgot_password_link(client):
    response = client.get("/login?mode=login")
    assert response.status_code == 200
    assert b"Sign in" in response.data
    assert b"Forgot your password?" in response.data


def test_forgot_password_route_returns_message(client):
    response = client.post(
        "/forgot-password",
        data={"email": "student@veritas.edu.ng", "language": "en"},
        follow_redirects=True,
    )
    assert response.status_code == 200
    assert b"Password reset" in response.data or b"reset email" in response.data


def test_signup_stays_on_auth_flow_instead_of_logging_in(client):
    response = client.post(
        "/signup",
        data={
            "name": "New Student",
            "email": "newstudent@example.com",
            "password": "secret123",
            "language": "en",
        },
        follow_redirects=True,
    )
    assert response.status_code == 200
    assert b"Please log in" in response.data or b"confirm your email" in response.data
    assert b"Sign in" in response.data


def test_student_cannot_open_admin(client):
    login(client, "student@veritas.edu.ng", "student123")
    response = client.get("/admin", follow_redirects=True)
    assert response.status_code == 200
    assert b"Dashboard" in response.data


def test_admin_can_create_announcement(client):
    login(client, "admin@veritas.edu.ng", "admin123")
    response = client.post(
        "/api/admin/announcements",
        json={"title": "Exam timetable update", "content": "Check the portal by Thursday.", "expires_at": "2026-04-30"},
    )
    assert response.status_code == 201
    payload = response.get_json()
    assert payload["title"] == "Exam timetable update"


def test_admin_can_create_notification(client, app):
    login(client, "admin@veritas.edu.ng", "admin123")
    student_id = next(user["id"] for user in app.data_repo.memory["users"] if user["role"] == "student")
    response = client.post(
        "/api/admin/notifications",
        json={"user_id": student_id, "message": "Portal update available.", "type": "update", "date": "2026-04-30"},
    )
    assert response.status_code == 201
    payload = response.get_json()
    assert payload["user_id"] == student_id


def test_admin_can_create_calendar_event(client):
    login(client, "admin@veritas.edu.ng", "admin123")
    response = client.post(
        "/api/admin/calendar",
        json={"title": "Law briefing", "event_type": "event", "start_date": "2026-05-02", "target_department": "Law"},
    )
    assert response.status_code == 201
    payload = response.get_json()
    assert payload["title"] == "Law briefing"


def test_known_faq_uses_knowledge_base(client):
    login(client, "student@veritas.edu.ng", "student123")
    response = client.post("/api/chat", json={"message": "How do I register my courses?", "language": "en"})
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["source"] == "knowledge_base"
    assert "knowledge base" in payload["response"].lower()


def test_unknown_question_gracefully_falls_back(client):
    login(client, "student@veritas.edu.ng", "student123")
    response = client.post("/api/chat", json={"message": "Tell me something impossible", "language": "en"})
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["source"] == "ai_unavailable"
    assert "not configured" in payload["response"].lower()


def test_pidgin_response_respects_language(client):
    login(client, "student@veritas.edu.ng", "student123")
    response = client.post("/api/chat", json={"message": "How I fit do my course registration?", "language": "pidgin"})
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["source"] == "knowledge_base"
    assert "school info" in payload["response"].lower() or "wetin" in payload["response"].lower()


def test_resource_page_lists_seeded_resource(client):
    login(client, "student@veritas.edu.ng", "student123")
    response = client.get("/resources")
    assert response.status_code == 200
    assert b"CSC 301 Past Questions" in response.data


def test_tools_and_map_pages_load(client):
    login(client, "student@veritas.edu.ng", "student123")
    tools_response = client.get("/tools")
    map_response = client.get("/map")
    assert tools_response.status_code == 200
    assert map_response.status_code == 200
    assert b"Lecture Note Summaries" in tools_response.data
    assert b"Campus Map" in map_response.data


def test_settings_calendar_and_notes_pages_load(client):
    login(client, "student@veritas.edu.ng", "student123")
    settings_response = client.get("/settings")
    calendar_response = client.get("/calendar")
    notes_response = client.get("/notes")
    assert settings_response.status_code == 200
    assert calendar_response.status_code == 200
    assert notes_response.status_code == 200
    assert b"Targeted access details" in settings_response.data
    assert b"Whole school calendar" in calendar_response.data
    assert b"Study scratchpad" in notes_response.data


def test_settings_save_updates_incomplete_student_and_allows_dashboard(client, app):
    app.data_repo.memory["users"].append(
        {
            "id": "student-incomplete-2",
            "name": "Profile Student",
            "email": "profile@veritas.edu.ng",
            "password": "student123",
            "role": "student",
            "preferred_language": "en",
            "phone": "",
            "department": "",
            "faculty": "",
            "level": "",
            "student_number": "",
            "created_at": "2026-04-28T00:00:00Z",
        }
    )
    login(client, "profile@veritas.edu.ng", "student123")
    response = client.post(
        "/settings",
        data={
            "name": "Profile Student",
            "phone": "+2348012345678",
            "department": "Law",
            "faculty": "Law",
            "level": "200",
            "student_number": "VUG/LAW/2002",
            "preferred_language": "en",
        },
        follow_redirects=True,
    )
    assert response.status_code == 200
    assert b"Profile updated successfully." in response.data
    assert b"Welcome back" in response.data


def test_unauthorized_admin_api_rejected(client):
    response = client.post("/api/admin/resources", json={})
    assert response.status_code == 403
