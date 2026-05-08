import { apiFetch } from "@/lib/api/flask-client";

export interface UploadDocumentResponse {
  document: {
    id: string;
    title: string;
    category: string;
    source_type: string;
  };
  chunks_created: number;
  whatsapp_messages: number;
}

export async function uploadDocument(formData: FormData, accessToken?: string) {
  return apiFetch<UploadDocumentResponse>("/api/documents/upload", accessToken, {
    method: "POST",
    body: formData,
    headers: {},
  });
}
