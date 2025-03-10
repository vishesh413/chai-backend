import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {User} from "../models/user.model.js";
import {uploadCloudinary} from "../utils/cloudinary";
import { ApiResponse } from "../utils/ApiResponse.js";

const registerUser = asyncHandler( async (req, res) => {
    const {fullName, email, username, password } = req.body
    
    if (
        [fullName, email, username, password].some((field) => field?.trim() === "")
        // trim remove whitespace from both ends
    ) {
        throw new ApiError(400, "ALL fields are required")
    }

    const existedUser = User.findOne({
        $or: [{ username }, { email }]
    })

    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.files?.coverImage[0]?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }

    const avatar = await uploadCloudinary(avatarLocalPath)
    const coverImage = await uploadCloudinary(coverImageLocalPath)

    if (!avatar) {
        throw new ApiError(400, "Avatar file is required")
    }

    // yaha pr hum ye user isiliye create kr rahe hai kuki hamko database me entry krwani hai 
    const user = User.create({
        fullName,
        avatar:avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.tolowerCase()
    })

    const createdUser = await User.findById(user._id).select("-password -refreshToken")
    // yaha pr frontend me ye na show ho ki ky?? password isliye yaha pr  .select use kiya hai

    if(!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registerd succesfully")
    )
})



export { registerUser}
