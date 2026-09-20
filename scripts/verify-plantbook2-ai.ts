import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function readAll(table: string, columns = "*") {
  const rows: Record<string, unknown>[] = [];

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + 999);

    if (error) throw error;
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < 1000) return rows;
  }
}

async function main() {
const [plants, elements, crafts] = await Promise.all([
  readAll(
    "plantbook2_plants",
    "id,title,image_url,image_source_url,image_attribution,ai_generated",
  ),
  readAll("plantbook2_elements", "id,title,ai_generated"),
  readAll(
    "plantbook2_crafts",
    "id,plant_id,element_id,result_plant_id,notes,ai_generated",
  ),
]);

const plantsById = new Map(plants.map((plant) => [plant.id, plant]));
const elementsById = new Map(elements.map((element) => [element.id, element]));
const aiPlants = plants.filter((plant) => plant.ai_generated);
const mosaicRecipe = crafts
  .map((craft) => ({
    source: plantsById.get(craft.plant_id),
    element: elementsById.get(craft.element_id),
    result: plantsById.get(craft.result_plant_id),
  }))
  .find((recipe) => recipe.result?.title === "Mosaic Plant");

const generatedUses = elements
  .filter((element) => element.ai_generated)
  .map((element) => ({
    element: element.title,
    uses: crafts.filter((craft) => craft.element_id === element.id).length,
  }))
  .sort((left, right) =>
    String(left.element).localeCompare(String(right.element)),
  );

const clover = plants.find((plant) => plant.title === "Clover");
const whiteClover = plants.find((plant) => plant.title === "White Clover");
const recipesByPair = new Map<string, Record<string, unknown>[]>();
crafts.forEach((craft) => {
  const key = `${craft.plant_id}:${craft.element_id}`;
  recipesByPair.set(key, [...(recipesByPair.get(key) || []), craft]);
});
const duplicateRecipes = [...recipesByPair.values()]
  .filter((recipes) => recipes.length > 1)
  .map((recipes) => ({
    source: plantsById.get(recipes[0].plant_id)?.title,
    element: elementsById.get(recipes[0].element_id)?.title,
    results: recipes.map(
      (recipe) => plantsById.get(recipe.result_plant_id)?.title,
    ),
  }));
const duplicateSources = new Set(duplicateRecipes.map((group) => group.source));
const duplicateSourceInventory = plants
  .filter((plant) => duplicateSources.has(plant.title))
  .map((plant) => ({
    source: plant.title,
    recipes: crafts
      .filter((craft) => craft.plant_id === plant.id)
      .map((craft) => ({
        element: elementsById.get(craft.element_id)?.title,
        result: plantsById.get(craft.result_plant_id)?.title,
        aiGenerated: craft.ai_generated,
      })),
  }));

console.log(
  JSON.stringify(
    {
      counts: {
        plants: plants.length,
        elements: elements.length,
        crafts: crafts.length,
        aiPlants: aiPlants.length,
        aiCrafts: crafts.filter((craft) => craft.ai_generated).length,
      },
      soilPresent: elements.some((element) => element.title === "Soil"),
      mosaic: mosaicRecipe && {
        source: mosaicRecipe.source?.title,
        element: mosaicRecipe.element?.title,
        result: mosaicRecipe.result?.title,
        notes: crafts.find(
          (craft) => craft.result_plant_id === mosaicRecipe.result?.id,
        )?.notes,
      },
      missingImages: aiPlants
        .filter(
          (plant) =>
            !plant.image_url ||
            !plant.image_source_url ||
            !plant.image_attribution,
        )
        .map((plant) => plant.title),
      generatedUses,
      samePlantImageStable: clover?.image_url === whiteClover?.image_url,
      duplicateRecipes,
      duplicateSourceInventory,
    },
    null,
    2,
  ),
);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
