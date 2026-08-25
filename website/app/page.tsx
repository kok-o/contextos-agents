import { HeroSection } from "@/components/sections/hero";
import { SkillsCarouselSection } from "@/components/sections/skills-carousel";
import { SlashCommandsSection } from "@/components/sections/slash-commands";
import { SkillResolutionSection } from "@/components/sections/skill-resolution";
import { ProfilesSection } from "@/components/sections/profiles";
import { HowItWorksSection } from "@/components/sections/how-it-works";

export default function HomePage() {
  return (
    <div className="flex flex-col w-full">
      <HeroSection />
      <SkillsCarouselSection />
      <SlashCommandsSection />
      <SkillResolutionSection />
      <ProfilesSection />
      <HowItWorksSection />
    </div>
  );
}
