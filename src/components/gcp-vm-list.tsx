"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/utils/api";
import {
  Server,
  HardDrive,
  Cpu,
  Globe,
  Network,
  ChevronDown,
  ChevronRight,
  Power,
  PowerOff,
  RefreshCw,
  AlertCircle,
  Cloud,
  Tag,
  Key,
  Database,
  Shield,
  Activity,
  Loader2,
} from "lucide-react";

interface VMMetadata {
  [key: string]: string | number | boolean | Record<string, unknown>;
}

interface VMInstance {
  name: string;
  zone: string;
  machineType: string;
  status: string;
  internalIP?: string;
  externalIP?: string;
  creationTimestamp: string;
  id: string;
  cpuPlatform?: string;
  metadata?: VMMetadata;
  labels?: Record<string, string>;
  disks?: Array<{
    name: string;
    sizeGb: string;
    type: string;
    mode: string;
  }>;
  networkInterfaces?: Array<{
    name: string;
    network: string;
    subnetwork: string;
    accessConfigs?: Array<{
      name: string;
      natIP?: string;
    }>;
  }>;
  tags?: string[];
  serviceAccounts?: Array<{
    email: string;
    scopes: string[];
  }>;
}

function VMStatusBadge({ status }: { status: string }) {
  const statusConfig = {
    RUNNING: { color: "bg-green-500", icon: <Activity className="w-3 h-3" />, text: "running" },
    STOPPED: { color: "bg-gray-500", icon: <PowerOff className="w-3 h-3" />, text: "stopped" },
    TERMINATED: { color: "bg-red-500", icon: <AlertCircle className="w-3 h-3" />, text: "terminated" },
    STOPPING: { color: "bg-yellow-500", icon: <Loader2 className="w-3 h-3 animate-spin" />, text: "stopping" },
    STARTING: { color: "bg-blue-500", icon: <Loader2 className="w-3 h-3 animate-spin" />, text: "starting" },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || {
    color: "bg-gray-400",
    icon: <AlertCircle className="w-3 h-3" />,
    text: status.toLowerCase(),
  };

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-white text-xs font-medium ${config.color}`}>
      {config.icon}
      {config.text}
    </div>
  );
}

function VMCard({ vm, onRefresh }: { vm: VMInstance; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [metadata, setMetadata] = useState<VMMetadata>({});

  const startVMMutation = api.gcp.startVM.useMutation();
  const stopVMMutation = api.gcp.stopVM.useMutation();
  
  // refresh on successful mutation
  if (startVMMutation.isSuccess || stopVMMutation.isSuccess) {
    setTimeout(onRefresh, 2000);
  }

  const getMetadataQuery = api.gcp.getVMMetadata.useQuery(
    { name: vm.name, zone: vm.zone },
    { 
      enabled: false
    }
  );
  
  // handle metadata update when query completes
  if (getMetadataQuery.data?.success && loadingMetadata) {
    setMetadata(getMetadataQuery.data.metadata || {});
    setLoadingMetadata(false);
  }

  const handleToggleMetadata = async () => {
    if (!metadataExpanded && Object.keys(metadata).length === 0) {
      setLoadingMetadata(true);
      await getMetadataQuery.refetch();
    }
    setMetadataExpanded(!metadataExpanded);
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalDiskSize = vm.disks?.reduce((sum, disk) => sum + parseInt(disk.sizeGb), 0) || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200 hover:shadow-xl transition-shadow"
    >
      {/* header */}
      <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <Server className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{vm.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{vm.zone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <VMStatusBadge status={vm.status} />
            <div className="flex gap-1">
              {vm.status === "STOPPED" && (
                <button
                  onClick={() => startVMMutation.mutate({ name: vm.name, zone: vm.zone })}
                  disabled={startVMMutation.isPending}
                  className="p-1.5 hover:bg-green-100 rounded-lg transition-colors"
                  title="start vm"
                >
                  <Power className="w-4 h-4 text-green-600" />
                </button>
              )}
              {vm.status === "RUNNING" && (
                <button
                  onClick={() => stopVMMutation.mutate({ name: vm.name, zone: vm.zone })}
                  disabled={stopVMMutation.isPending}
                  className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                  title="stop vm"
                >
                  <PowerOff className="w-4 h-4 text-red-600" />
                </button>
              )}
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* quick info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">{vm.machineType}</span>
          </div>
          {vm.externalIP && (
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600">{vm.externalIP}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">{vm.internalIP}</span>
          </div>
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">{totalDiskSize} GB</span>
          </div>
        </div>
      </div>

      {/* expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 border-t border-gray-100 space-y-4">
              {/* basic info */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  instance details
                </h4>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">instance id:</span>
                    <span className="font-mono text-gray-700">{vm.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">cpu platform:</span>
                    <span className="text-gray-700">{vm.cpuPlatform || "n/a"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">created:</span>
                    <span className="text-gray-700">{formatDate(vm.creationTimestamp)}</span>
                  </div>
                </div>
              </div>

              {/* disks */}
              {vm.disks && vm.disks.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <HardDrive className="w-4 h-4" />
                    disks
                  </h4>
                  <div className="space-y-1">
                    {vm.disks.map((disk, idx) => (
                      <div key={idx} className="bg-gray-50 rounded-lg p-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-gray-700">{disk.name}</span>
                          <div className="flex gap-2 text-xs text-gray-500">
                            <span>{disk.sizeGb} GB</span>
                            <span className="text-gray-400">•</span>
                            <span>{disk.type}</span>
                            <span className="text-gray-400">•</span>
                            <span>{disk.mode}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* labels */}
              {vm.labels && Object.keys(vm.labels).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    labels
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(vm.labels).map(([key, value]) => (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs"
                      >
                        <span className="font-medium">{key}:</span>
                        <span>{value}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* metadata */}
              <div className="space-y-2">
                <button
                  onClick={handleToggleMetadata}
                  className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    metadata
                  </h4>
                  <div className="flex items-center gap-2">
                    {loadingMetadata && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                    {metadataExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </button>
                
                <AnimatePresence>
                  {metadataExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
                        {Object.keys(metadata).length > 0 ? (
                          <div className="space-y-2 text-sm">
                            {Object.entries(metadata).map(([key, value]) => (
                              <div key={key} className="border-b border-gray-200 pb-2 last:border-0">
                                <div className="font-medium text-gray-700 mb-1">{key}:</div>
                                <div className="text-gray-600 font-mono text-xs whitespace-pre-wrap break-all">
                                  {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">no metadata found</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* service accounts */}
              {vm.serviceAccounts && vm.serviceAccounts.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    service accounts
                  </h4>
                  <div className="space-y-1">
                    {vm.serviceAccounts.map((sa, idx) => (
                      <div key={idx} className="bg-gray-50 rounded-lg p-2 text-sm">
                        <p className="font-medium text-gray-700">{sa.email}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {sa.scopes.length} scope{sa.scopes.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function GCPVMList() {
  console.log('GCPVMList component mounting');
  const [selectedProject, setSelectedProject] = useState<string>("");

  const { data: currentProjectData } = api.gcp.getCurrentProject.useQuery();
  const { data: projectsData } = api.gcp.listProjects.useQuery();
  const { data: vmsData, isLoading, error, refetch } = api.gcp.listVMs.useQuery(
    selectedProject ? { projectId: selectedProject } : { limit: 20 }
  );

  const handleProjectChange = (projectId: string) => {
    setSelectedProject(projectId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Cloud className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-500">loading gcp vms...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const isBufferError = error.message?.includes('maxBuffer');
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-500 mb-2">failed to load vms</p>
          <p className="text-sm text-gray-500 mb-2">
            {isBufferError 
              ? "too many vms to display. try using filters or pagination." 
              : error.message}
          </p>
          {isBufferError && (
            <p className="text-xs text-gray-400 mb-4">
              the issue has been fixed. please refresh to try again.
            </p>
          )}
          <button
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            retry
          </button>
        </div>
      </div>
    );
  }

  const vms = vmsData?.vms || [];

  return (
    <div className="max-w-6xl mx-auto">
      {/* header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Cloud className="w-8 h-8 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold text-gray-800">gcp virtual machines</h2>
              <p className="text-sm text-gray-500">
                {currentProjectData?.projectId && (
                  <>project: <span className="font-medium">{currentProjectData.projectId}</span></>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {projectsData?.projects && projectsData.projects.length > 1 && (
              <select
                value={selectedProject}
                onChange={(e) => handleProjectChange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">current project</option>
                {projectsData.projects.map((project) => (
                  <option key={project.projectId} value={project.projectId}>
                    {project.name} ({project.projectId})
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => refetch()}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="refresh"
            >
              <RefreshCw className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">total vms</p>
                <p className="text-2xl font-bold text-gray-800">{vms.length}</p>
              </div>
              <Server className="w-8 h-8 text-gray-300" />
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">running</p>
                <p className="text-2xl font-bold text-green-600">
                  {vms.filter((vm) => vm.status === "RUNNING").length}
                </p>
              </div>
              <Activity className="w-8 h-8 text-green-300" />
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">stopped</p>
                <p className="text-2xl font-bold text-gray-600">
                  {vms.filter((vm) => vm.status === "STOPPED").length}
                </p>
              </div>
              <PowerOff className="w-8 h-8 text-gray-300" />
            </div>
          </div>
        </div>
      </div>

      {/* vm list */}
      {vms.length > 0 ? (
        <div className="space-y-4">
          {vms.map((vm) => (
            <VMCard key={`${vm.zone}-${vm.name}`} vm={vm} onRefresh={() => refetch()} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
          <Server className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">no virtual machines found</p>
          <p className="text-sm text-gray-400 mt-2">
            make sure you have the right project selected and gcloud is configured
          </p>
        </div>
      )}
    </div>
  );
}