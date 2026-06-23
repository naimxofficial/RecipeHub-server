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
    const likesCollection = db.collection("likes");
    const favoritesCollection = db.collection("favorites");
    const reportsCollection = db.collection("reports");
    const usersCollection = db.collection("users");

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


    // POST /recipes/:id/like
    // Body: { userId, userEmail }
    // Toggles like — increments or decrements likesCount
    // Returns: { liked: bool, likesCount: number }
    app.post("/recipes/:id/like", async (req, res) => {
      try {
        if (!ObjectId.isValid(req.params.id)) {
          return res.status(400).json({ error: "Invalid recipe ID" });
        }
        const { userId, userEmail } = req.body;
        if (!userId || !userEmail) {
          return res.status(401).json({ error: "Unauthorised" });
        }

        const recipeId = req.params.id;
        const existing = await likesCollection.findOne({ recipeId, userId });

        let liked;
        if (existing) {
          // Unlike
          await likesCollection.deleteOne({ recipeId, userId });
          await recipesCollection.updateOne(
            { _id: new ObjectId(recipeId) },
            { $inc: { likesCount: -1 } }
          );
          liked = false;
        } else {
          // Like
          await likesCollection.insertOne({
            recipeId,
            userId,
            userEmail,
            likedAt: new Date(),
          });
          await recipesCollection.updateOne(
            { _id: new ObjectId(recipeId) },
            { $inc: { likesCount: 1 } }
          );
          liked = true;
        }

        const updated = await recipesCollection.findOne(
          { _id: new ObjectId(recipeId) },
          { projection: { likesCount: 1 } }
        );

        res.json({ liked, likesCount: updated.likesCount });
      } catch (err) {
        console.error("POST /recipes/:id/like error:", err);
        res.status(500).json({ error: "Failed to toggle like" });
      }
    });


    // GET /recipes/:id/like-status?userId=xxx
    // Returns: { liked: bool, likesCount: number }
    app.get("/recipes/:id/like-status", async (req, res) => {
      try {
        if (!ObjectId.isValid(req.params.id)) {
          return res.status(400).json({ error: "Invalid recipe ID" });
        }
        const { userId } = req.query;
        const recipeId = req.params.id;

        const [existing, recipe] = await Promise.all([
          userId ? likesCollection.findOne({ recipeId, userId }) : null,
          recipesCollection.findOne(
            { _id: new ObjectId(recipeId) },
            { projection: { likesCount: 1 } }
          ),
        ]);

        res.json({
          liked: !!existing,
          likesCount: recipe?.likesCount ?? 0,
        });
      } catch (err) {
        console.error("GET /recipes/:id/like-status error:", err);
        res.status(500).json({ error: "Failed to fetch like status" });
      }
    });


    // POST /recipes/:id/favorite
    // Body: { userId, userEmail }
    // Toggles favorite in favorites collection
    // Returns: { favorited: bool }
    app.post("/recipes/:id/favorite", async (req, res) => {
      try {
        if (!ObjectId.isValid(req.params.id)) {
          return res.status(400).json({ error: "Invalid recipe ID" });
        }
        const { userId, userEmail } = req.body;
        if (!userId || !userEmail) {
          return res.status(401).json({ error: "Unauthorised" });
        }

        const recipeId = req.params.id;
        const existing = await favoritesCollection.findOne({ recipeId, userId });

        let favorited;
        if (existing) {
          await favoritesCollection.deleteOne({ recipeId, userId });
          favorited = false;
        } else {
          await favoritesCollection.insertOne({
            recipeId,
            userId,
            userEmail,
            addedAt: new Date(),
          });
          favorited = true;
        }

        res.json({ favorited });
      } catch (err) {
        console.error("POST /recipes/:id/favorite error:", err);
        res.status(500).json({ error: "Failed to toggle favorite" });
      }
    });


    // GET /recipes/:id/favorite-status?userId=xxx
    // Returns: { favorited: bool }
    app.get("/recipes/:id/favorite-status", async (req, res) => {
      try {
        if (!ObjectId.isValid(req.params.id)) {
          return res.status(400).json({ error: "Invalid recipe ID" });
        }
        const { userId } = req.query;
        if (!userId) return res.json({ favorited: false });

        const existing = await favoritesCollection.findOne({
          recipeId: req.params.id,
          userId,
        });
        res.json({ favorited: !!existing });
      } catch (err) {
        console.error("GET /recipes/:id/favorite-status error:", err);
        res.status(500).json({ error: "Failed to fetch favorite status" });
      }
    });


    // POST /recipes/:id/report
    // Body: { reporterEmail, reason }
    // Saves report to reports collection
    // Returns: { success: bool }
    app.post("/recipes/:id/report", async (req, res) => {
      try {
        if (!ObjectId.isValid(req.params.id)) {
          return res.status(400).json({ error: "Invalid recipe ID" });
        }
        const { reporterEmail, reason } = req.body;
        if (!reporterEmail || !reason) {
          return res.status(400).json({ error: "Email and reason are required" });
        }

        const VALID_REASONS = ["Spam", "Offensive Content", "Copyright Issue"];
        if (!VALID_REASONS.includes(reason)) {
          return res.status(400).json({ error: "Invalid report reason" });
        }

        // Prevent duplicate reports from same user on same recipe
        const existing = await reportsCollection.findOne({
          recipeId: req.params.id,
          reporterEmail,
        });
        if (existing) {
          return res.status(409).json({ error: "You already reported this recipe" });
        }

        await reportsCollection.insertOne({
          recipeId: req.params.id,
          reporterEmail,
          reason,
          status: "pending",
          createdAt: new Date(),
        });

        res.json({ success: true });
      } catch (err) {
        console.error("POST /recipes/:id/report error:", err);
        res.status(500).json({ error: "Failed to submit report" });
      }
    });


    // POST /recipes
    // Body: { recipeName, recipeImage, category, cuisineType, difficultyLevel, preparationTime, ingredients,instructions, price, authorId, authorName, authorEmail }
    // Enforces 2-recipe limit for free (non-premium) users
    // Returns: { success: true, recipeId }
    app.post("/recipes", async (req, res) => {
      try {
        const {
          recipeName,
          recipeImage,
          category,
          cuisineType,
          difficultyLevel,
          preparationTime,
          ingredients,
          instructions,
          price,
          authorId,
          authorName,
          authorEmail,
          isPremium,
        } = req.body;

        // Basic validation
        if (
          !recipeName || !recipeImage || !category || !cuisineType ||
          !difficultyLevel || !preparationTime || !authorId ||
          !Array.isArray(ingredients) || ingredients.length === 0 ||
          !Array.isArray(instructions) || instructions.length === 0
        ) {
          return res.status(400).json({ error: "All fields are required" });
        }

        // Enforce 2-recipe limit for free users
        if (!isPremium) {
          const existingCount = await recipesCollection.countDocuments({ authorId });
          if (existingCount >= 2) {
            return res.status(403).json({
              error: "Free users can only add 2 recipes. Upgrade to Premium for unlimited recipes.",
              limitReached: true,
            });
          }
        }

        const now = new Date();
        const result = await recipesCollection.insertOne({
          recipeName,
          recipeImage,
          category,
          cuisineType,
          difficultyLevel,
          preparationTime,
          ingredients,
          instructions,
          price: parseFloat(price) || 0,
          authorId,
          authorName,
          authorEmail,
          likesCount: 0,
          isFeatured: false,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });

        res.status(201).json({ success: true, recipeId: result.insertedId });
      } catch (err) {
        console.error("POST /recipes error:", err);
        res.status(500).json({ error: "Failed to create recipe" });
      }
    });


    // GET /users/:id/premium-status
    // Returns: { isPremium: bool }
    app.get("/users/:id/premium-status", async (req, res) => {
      try {
        const user = await usersCollection.findOne(
          { id: req.params.id },
          { projection: { isPremium: 1 } }
        );
        res.json({ isPremium: user?.isPremium ?? false });
      } catch (err) {
        console.error("GET /users/:id/premium-status error:", err);
        res.status(500).json({ error: "Failed to fetch premium status" });
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