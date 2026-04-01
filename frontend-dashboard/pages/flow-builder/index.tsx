import DashboardLayout from "../../components/layout/DashboardLayout";

export default function Home() {
  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h1 className="text-3xl font-bold text-text-main mb-2">
          Chatbot Platform Overview
        </h1>
        <p className="text-text-muted max-w-lg">
          Welcome to the dashboard. Select a bot from the top navigation to begin viewing analytics, managing flows, and reviewing conversations.
        </p>
      </div>
    </DashboardLayout>
  );
}

