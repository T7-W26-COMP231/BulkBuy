const API_BASE_URL = `${import.meta.env.VITE_API_URL}/api/prdts`;

export async function getProducts() {
  const response = await fetch(API_BASE_URL);

  if (!response.ok) {
    throw new Error("Failed to fetch products");
  }
  console.log(response)

  return response.json();
}