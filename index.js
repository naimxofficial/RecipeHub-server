const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const uri = process.env.MONGODB_URI;
const PORT = process.env.PORT;

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}));
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB!");

    const db = client.db("recipehub");
    const recipesCollection = db.collection("recipes");


    // Health check
    app.get("/", (req, res) => {
      res.json({ status: "RecipeHub API is running" });
    });


    // GET /recipes/featured
    // Returns up to 4 recipes where isFeatured === true
    app.get("/recipes/featured", async (req, res) => {
      try {
        const recipes = await recipesCollection
          .find({ isFeatured: true, status: "active" })
          .limit(4)
          .toArray();
        res.json(recipes);
      } catch (err) {
        console.error("GET /recipes/featured error:", err);
        res.status(500).json({ error: "Failed to fetch featured recipes" });
      }
    });


    // GET /recipes/popular
    // Returns top 6 recipes sorted by likesCount descending
    app.get("/recipes/popular", async (req, res) => {
      try {
        const recipes = await recipesCollection
          .find({ status: "active" })
          .sort({ likesCount: -1 })
          .limit(6)
          .toArray();
        res.json(recipes);
      } catch (err) {
        console.error("GET /recipes/popular error:", err);
        res.status(500).json({ error: "Failed to fetch popular recipes" });
      }
    });


    // GET /recipes
    // Query params:
    //   page     : number  (default 1)
    //   limit    : number  (default 9)
    //   category : string  comma-separated e.g. "Dinner,Lunch"
    //              uses MongoDB $in operator
    // Returns: { recipes, totalCount, page, totalPages }
    app.get("/recipes", async (req, res) => {
      try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.max(1, Math.min(50, parseInt(req.query.limit) || 9));
        const skip = (page - 1) * limit;

        const filter = { status: "active" };

        if (req.query.category) {
          const categories = req.query.category
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean);
          if (categories.length > 0) {
            filter.category = { $in: categories };
          }
        }

        const [totalCount, recipes] = await Promise.all([
          recipesCollection.countDocuments(filter),
          recipesCollection
            .find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
        ]);

        res.json({
          recipes,
          totalCount,
          page,
          totalPages: Math.ceil(totalCount / limit),
        });
      } catch (err) {
        console.error("GET /recipes error:", err);
        res.status(500).json({ error: "Failed to fetch recipes" });
      }
    });


    // GET /recipes/:id
    // Returns a single recipe by MongoDB ObjectId
    app.get("/recipes/:id", async (req, res) => {
      try {
        if (!ObjectId.isValid(req.params.id)) {
          return res.status(400).json({ error: "Invalid recipe ID" });
        }
        const recipe = await recipesCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!recipe) {
          return res.status(404).json({ error: "Recipe not found" });
        }
        res.json(recipe);
      } catch (err) {
        console.error("GET /recipes/:id error:", err);
        res.status(500).json({ error: "Failed to fetch recipe" });
      }
    });


    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } finally {
    // await client.close();
  }
}

run().catch(console.dir);