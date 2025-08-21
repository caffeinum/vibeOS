import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

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
  metadata?: Record<string, any>;
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

export const gcpRouter = createTRPCRouter({
  listProjects: publicProcedure
    .query(async () => {
      try {
        const { stdout } = await execAsync('gcloud projects list --format=json', { maxBuffer: 10 * 1024 * 1024 });
        const projects = JSON.parse(stdout);
        
        return {
          success: true,
          projects: projects.map((p: any) => ({
            projectId: p.projectId,
            name: p.name,
            projectNumber: p.projectNumber,
            lifecycleState: p.lifecycleState,
            createTime: p.createTime,
          })),
        };
      } catch (error) {
        console.error("error listing projects:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "failed to list projects",
          projects: [],
        };
      }
    }),

  getCurrentProject: publicProcedure
    .query(async () => {
      try {
        const { stdout } = await execAsync('gcloud config get-value project');
        const projectId = stdout.trim();
        
        return {
          success: true,
          projectId,
        };
      } catch (error) {
        console.error("error getting current project:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "failed to get current project",
          projectId: null,
        };
      }
    }),

  listVMs: publicProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        limit: z.number().optional().default(50),
      }).optional()
    )
    .query(async ({ input }) => {
      try {
        // get list of all vms with basic info - with larger buffer and limit
        let command = `gcloud compute instances list --format=json --limit=${input?.limit || 50}`;
        if (input?.projectId) {
          command += ` --project=${input.projectId}`;
        }
        
        // increase buffer size to 10MB for large outputs
        const { stdout } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
        const instances = JSON.parse(stdout || '[]');
        
        const vms: VMInstance[] = instances.map((instance: any) => {
          // extract zone from zone url
          const zoneParts = instance.zone?.split('/') || [];
          const zone = zoneParts[zoneParts.length - 1];
          
          // extract machine type
          const machineTypeParts = instance.machineType?.split('/') || [];
          const machineType = machineTypeParts[machineTypeParts.length - 1];
          
          // get network info
          const networkInterface = instance.networkInterfaces?.[0];
          const accessConfig = networkInterface?.accessConfigs?.[0];
          
          return {
            name: instance.name,
            zone,
            machineType,
            status: instance.status,
            internalIP: networkInterface?.networkIP,
            externalIP: accessConfig?.natIP,
            creationTimestamp: instance.creationTimestamp,
            id: instance.id,
            cpuPlatform: instance.cpuPlatform,
            labels: instance.labels || {},
            tags: instance.tags?.items || [],
            disks: instance.disks?.map((disk: any) => ({
              name: disk.deviceName,
              sizeGb: disk.diskSizeGb,
              type: disk.type,
              mode: disk.mode,
            })),
            networkInterfaces: instance.networkInterfaces,
            serviceAccounts: instance.serviceAccounts,
          };
        });
        
        return {
          success: true,
          vms,
          count: vms.length,
        };
      } catch (error) {
        console.error("error listing vms:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "failed to list vms",
          vms: [],
          count: 0,
        };
      }
    }),

  getVMDetails: publicProcedure
    .input(
      z.object({
        name: z.string(),
        zone: z.string(),
        projectId: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        let command = `gcloud compute instances describe ${input.name} --zone=${input.zone} --format=json`;
        if (input.projectId) {
          command += ` --project=${input.projectId}`;
        }
        
        const { stdout } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
        const instance = JSON.parse(stdout);
        
        // get metadata items
        const metadata: Record<string, any> = {};
        if (instance.metadata?.items) {
          instance.metadata.items.forEach((item: any) => {
            metadata[item.key] = item.value;
          });
        }
        
        return {
          success: true,
          details: {
            ...instance,
            metadata,
          },
        };
      } catch (error) {
        console.error("error getting vm details:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "failed to get vm details",
          details: null,
        };
      }
    }),

  startVM: publicProcedure
    .input(
      z.object({
        name: z.string(),
        zone: z.string(),
        projectId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        let command = `gcloud compute instances start ${input.name} --zone=${input.zone}`;
        if (input.projectId) {
          command += ` --project=${input.projectId}`;
        }
        
        await execAsync(command);
        
        return {
          success: true,
          message: `VM ${input.name} started successfully`,
        };
      } catch (error) {
        console.error("error starting vm:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "failed to start vm",
        };
      }
    }),

  stopVM: publicProcedure
    .input(
      z.object({
        name: z.string(),
        zone: z.string(),
        projectId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        let command = `gcloud compute instances stop ${input.name} --zone=${input.zone}`;
        if (input.projectId) {
          command += ` --project=${input.projectId}`;
        }
        
        await execAsync(command);
        
        return {
          success: true,
          message: `VM ${input.name} stopped successfully`,
        };
      } catch (error) {
        console.error("error stopping vm:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "failed to stop vm",
        };
      }
    }),

  getVMMetadata: publicProcedure
    .input(
      z.object({
        name: z.string(),
        zone: z.string(),
        projectId: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        // get instance metadata specifically
        let command = `gcloud compute instances describe ${input.name} --zone=${input.zone} --format="json(metadata)"`;
        if (input.projectId) {
          command += ` --project=${input.projectId}`;
        }
        
        const { stdout } = await execAsync(command);
        const result = JSON.parse(stdout);
        
        const metadata: Record<string, any> = {};
        if (result.metadata?.items) {
          result.metadata.items.forEach((item: any) => {
            metadata[item.key] = item.value;
          });
        }
        
        return {
          success: true,
          metadata,
          fingerprint: result.metadata?.fingerprint,
        };
      } catch (error) {
        console.error("error getting vm metadata:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "failed to get vm metadata",
          metadata: {},
        };
      }
    }),
});