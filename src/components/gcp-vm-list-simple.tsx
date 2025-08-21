"use client";

import { api } from "@/utils/api";
import { Cloud, AlertCircle } from "lucide-react";

export function GCPVMListSimple() {
  console.log('GCPVMListSimple rendering');
  
  const { data: vmsData, isLoading, error } = api.gcp.listVMs.useQuery({ limit: 5 });
  
  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <Cloud className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
        <p>loading gcp vms...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-500">error: {error.message}</p>
      </div>
    );
  }
  
  const vms = vmsData?.vms || [];
  
  return (
    <div className="p-8 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-4">gcp vms ({vms.length})</h2>
      {vms.length === 0 ? (
        <p className="text-gray-500">no vms found</p>
      ) : (
        <ul className="space-y-2">
          {vms.map((vm) => (
            <li key={vm.id} className="p-3 bg-gray-50 rounded">
              <div className="font-medium">{vm.name}</div>
              <div className="text-sm text-gray-500">
                {vm.zone} • {vm.status} • {vm.machineType}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}