class LocalizationService:
    def __init__(self):
        self.supported = {
            "en": {
                "hero_tag": "AI-powered campus support",
                "hero_title": "Your Veritas student assistant for questions, updates, and guidance.",
                "hero_copy": "Get instant help with course registration, fees, clearance, hostel booking, and important campus updates from one polished dashboard.",
                "get_started": "Get Started",
                "learn_more": "Learn More",
                "welcome": "Welcome back",
                "login_title": "Sign in to continue",
                "email": "Email address",
                "password": "Password",
                "full_name": "Full name",
                "dashboard": "Dashboard",
                "chatbot": "Chatbot",
                "notifications": "Notifications",
                "resources": "Resources",
                "tools": "Tools",
                "map": "Campus Map",
                "admin": "Admin",
                "quick_actions": "Quick actions",
                "announcements": "Announcements",
                "reminders": "Reminders",
                "recent_activity": "Recent activity",
                "knowledge_label": "Knowledge Base",
                "ai_label": "AI Fallback",
                "message_placeholder": "Message your student assistant...",
            },
            "pidgin": {
                "hero_tag": "AI support for campus",
                "hero_title": "Your Veritas padi wey fit answer question and guide you sharp-sharp.",
                "hero_copy": "Get quick help for course registration, school fees, clearance, hostel booking, and better campus updates from one clean dashboard.",
                "get_started": "Start Now",
                "learn_more": "See More",
                "welcome": "Welcome back",
                "login_title": "Sign in make you continue",
                "email": "Email address",
                "password": "Password",
                "full_name": "Full name",
                "dashboard": "Dashboard",
                "chatbot": "Chatbot",
                "notifications": "Notifications",
                "resources": "Resources",
                "tools": "Tools",
                "map": "Campus Map",
                "admin": "Admin",
                "quick_actions": "Quick actions",
                "announcements": "Announcements",
                "reminders": "Reminders",
                "recent_activity": "Recent activity",
                "knowledge_label": "School Info",
                "ai_label": "AI Help",
                "message_placeholder": "Type your message to the assistant...",
            },
        }

    def normalize_language(self, language):
        if language in self.supported:
            return language
        return "en"

    def get_text(self, language, key):
        language = self.normalize_language(language)
        return self.supported[language].get(key, self.supported["en"].get(key, key))

    def bundle(self, language):
        language = self.normalize_language(language)
        return self.supported[language]
