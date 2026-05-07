class StorageService:
    def __init__(self, supabase, bucket):
        self.supabase = supabase
        self.bucket = bucket

    def upload_bytes(self, path, data, content_type="application/octet-stream"):
        result = self.supabase.storage.from_(self.bucket).upload(
            path,
            data,
            {"content-type": content_type, "upsert": "true"},
        )
        return result

    def public_url(self, path):
        return self.supabase.storage.from_(self.bucket).get_public_url(path)
