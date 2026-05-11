"use client";

import { SimpleAdminManager } from "@/components/admin/simple-admin-manager";
import { createAdminService, deleteAdminService, getAdminServices, updateAdminService, type ServiceRow } from "@/lib/api/admin";

export default function AdminServicesPage() {
  return (
    <SimpleAdminManager<ServiceRow>
      title="School Services"
      eyebrow="Operational directory"
      description="Maintain bursary, hostel, registration, clearance, exam, and general service information."
      fields={[
        { name: "service_name", label: "Service Name" },
        { name: "category", label: "Category", type: "select", options: ["registration", "fees", "hostel", "clearance", "exam", "general"] },
        { name: "description", label: "Description", type: "textarea" },
        { name: "info", label: "Detailed Information", type: "textarea" },
      ]}
      load={getAdminServices}
      create={(payload, token) =>
        createAdminService(
          {
            service_name: String(payload.service_name || ""),
            category: String(payload.category || "general"),
            description: String(payload.description || "") || null,
            info: String(payload.info || "") || null,
          },
          token,
        )
      }
      remove={deleteAdminService}
      update={(id, payload, token) =>
        updateAdminService(id, {
          service_name: String(payload.service_name || ""),
          category: String(payload.category || "general"),
          description: String(payload.description || "") || null,
          info: String(payload.info || "") || null,
        }, token)
      }
      render={(item) => (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#545f72]">{item.category || "general"}</p>
          <h2 className="mt-2 text-lg font-black text-[var(--gov-primary)]">{item.service_name}</h2>
          {item.description ? <p className="mt-3 text-sm leading-6 text-[#3c475a]">{item.description}</p> : null}
          {item.info ? <p className="mt-3 rounded bg-[#f4f3f7] p-3 text-sm leading-6 text-[#3c475a]">{item.info}</p> : null}
        </>
      )}
    />
  );
}
