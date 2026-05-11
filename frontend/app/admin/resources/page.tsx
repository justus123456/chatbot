"use client";

import { SimpleAdminManager } from "@/components/admin/simple-admin-manager";
import { createAdminResource, deleteAdminResource, getAdminResources, updateAdminResource, type ResourceRow } from "@/lib/api/admin";

export default function AdminResourcesPage() {
  return (
    <SimpleAdminManager<ResourceRow>
      title="Resources & Past Questions"
      eyebrow="Student materials"
      description="Publish resources and past questions by department and level without exposing private student files."
      fields={[
        { name: "title", label: "Title" },
        { name: "file_url", label: "File URL" },
        { name: "type", label: "Type", type: "select", options: ["material", "past_question"] },
        { name: "description", label: "Description", type: "textarea" },
        { name: "department", label: "Department" },
        { name: "level", label: "Level", type: "number" },
      ]}
      load={getAdminResources}
      create={(payload, token) =>
        createAdminResource(
          {
            title: String(payload.title || ""),
            file_url: String(payload.file_url || ""),
            type: String(payload.type || "material") as "material" | "past_question",
            description: String(payload.description || ""),
            department: String(payload.department || "") || null,
            level: payload.level ? Number(payload.level) : null,
          },
          token,
        )
      }
      remove={deleteAdminResource}
      update={(id, payload, token) =>
        updateAdminResource(id, {
          title: String(payload.title || ""),
          file_url: String(payload.file_url || ""),
          type: String(payload.type || "material") as "material" | "past_question",
          description: String(payload.description || ""),
          department: String(payload.department || "") || null,
          level: payload.level ? Number(payload.level) : null,
        }, token)
      }
      render={(item) => (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#545f72]">{item.type.replace("_", " ")}</p>
          <h2 className="mt-2 text-lg font-black text-[var(--gov-primary)]">{item.title}</h2>
          <p className="mt-3 text-sm leading-6 text-[#3c475a]">{item.description}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-[#3c475a]">
            <span className="rounded-full bg-[#d6e3ff] px-3 py-1">{item.department || "All departments"}</span>
            <span className="rounded-full bg-[#efedf1] px-3 py-1">{item.level ? `${item.level} level` : "All levels"}</span>
          </div>
        </>
      )}
    />
  );
}
