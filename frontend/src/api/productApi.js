const API_BASE_URL = "http://localhost:5000/api/prdts";

export async function getProducts() {
  const response = await fetch(API_BASE_URL);

  if (!response.ok) {
    throw new Error("Failed to fetch products");
  }
  console.log(response)

  return response.json();
}