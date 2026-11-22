import { SkillLogo } from "../components/SkillLogo";
import { useState } from "react";
import { NewHobbyModal } from "../components/Layout";
import { Button } from "../components/ui";

export function WelcomePage() {
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <SkillLogo className="size-12" />
        <h1 className="text-xl font-semibold">Skill</h1>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => setCreating(true)}>
            Hobby anlegen
          </Button>
        </div>
      </div>
      <NewHobbyModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
