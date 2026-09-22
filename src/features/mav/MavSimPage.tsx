import { ToolPage } from "@/components/tool-page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function MavSimPage() {
  return (
    <ToolPage
      title="MAVLink Flight Simulator"
      note="This simulator expects a local MAVLink websocket at ws://localhost:56781/websocket/server."
      noteLabel="Connection"
    >
      <Card>
        <CardHeader>
          <CardTitle>Simulator runtime</CardTitle>
          <CardDescription>
            Start the local MAVLink bridge, then use the simulator route from the same machine running the bridge.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border bg-secondary/40 p-4 font-mono text-sm">
            ws://localhost:56781/websocket/server
          </div>
        </CardContent>
      </Card>
    </ToolPage>
  );
}
