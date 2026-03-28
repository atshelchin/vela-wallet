package app.getvela.wallet.ui.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.model.WalletState
import app.getvela.wallet.service.ApiNft
import app.getvela.wallet.service.WalletApiService
import app.getvela.wallet.ui.theme.*
import coil3.compose.SubcomposeAsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
fun NFTGalleryScreen(
    wallet: WalletState,
    onNftClick: (ApiNft) -> Unit = {},
    useMockData: Boolean = false,
) {
    var nfts by remember { mutableStateOf<List<ApiNft>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }

    LaunchedEffect(wallet.address) {
        if (useMockData) {
            nfts = mockNfts()
            return@LaunchedEffect
        }
        if (wallet.address.isEmpty()) return@LaunchedEffect
        isLoading = true
        nfts = withContext(Dispatchers.IO) { WalletApiService().fetchNFTs(wallet.address) }
        isLoading = false
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding(),
    ) {
        // Header
        Text(
            text = stringResource(R.string.tab_nfts),
            style = VelaTypography.title(17f),
            color = VelaColor.textPrimary,
            modifier = Modifier.padding(horizontal = VelaSpacing.screenH, vertical = 12.dp),
        )

        when {
            isLoading -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(Modifier.size(24.dp), color = VelaColor.textTertiary, strokeWidth = 2.dp)
                }
            }
            nfts.isEmpty() -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("🖼", fontSize = 40.sp)
                        Spacer(Modifier.height(16.dp))
                        Text(stringResource(R.string.home_no_nfts), style = VelaTypography.body(14f), color = VelaColor.textTertiary)
                    }
                }
            }
            else -> {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(nfts, key = { it.id }) { nft ->
                        NFTCard(nft = nft, onClick = { onNftClick(nft) })
                    }
                }
            }
        }
    }
}

@Composable
private fun NFTCard(nft: ApiNft, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(VelaRadius.card))
            .background(VelaColor.bgCard)
            .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.card))
            .clickable(onClick = onClick),
    ) {
        // Image
        if (nft.imageUrl != null) {
            SubcomposeAsyncImage(
                model = nft.imageUrl,
                contentDescription = nft.displayName,
                modifier = Modifier.fillMaxWidth().height(160.dp),
                contentScale = ContentScale.Crop,
                error = { NFTPlaceholder() },
                loading = { NFTPlaceholder() },
            )
        } else {
            NFTPlaceholder()
        }

        // Info
        Column(modifier = Modifier.padding(10.dp)) {
            Text(
                nft.displayName,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = VelaColor.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                nft.collectionName ?: nft.chainName,
                fontSize = 11.sp,
                color = VelaColor.textTertiary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun NFTPlaceholder() {
    Box(
        modifier = Modifier.fillMaxWidth().height(160.dp).background(VelaColor.bgWarm),
        contentAlignment = Alignment.Center,
    ) {
        Text("🖼", fontSize = 28.sp)
    }
}

// MARK: - Mock Data

private fun mockNfts(): List<ApiNft> = listOf(
    ApiNft(
        network = "eth-mainnet", chainName = "Ethereum",
        contractAddress = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
        tokenId = "3749", name = "Bored Ape #3749",
        description = "The Bored Ape Yacht Club is a collection of 10,000 unique Bored Ape NFTs.",
        image = "https://i.seadn.io/gae/aCFMJqFr1tPflRMDKPKxLnW54PjBiigwRj3qNh2VhNKhXeJE2gg-KuGYJDmOWCdaOE-S59VNjEybhSD2Cj9XFA?w=500",
        tokenType = "ERC721", collectionName = "Bored Ape Yacht Club", collectionImage = null,
    ),
    ApiNft(
        network = "eth-mainnet", chainName = "Ethereum",
        contractAddress = "0x60E4d786628Fea6478F785A6d7e704777c86a7c6",
        tokenId = "8821", name = "Mutant Ape #8821",
        description = "The MAYC is a collection of up to 20,000 Mutant Apes.",
        image = "https://i.seadn.io/gcs/files/4c1ac53895ad7cf63874a1dd30d28def.png?w=500",
        tokenType = "ERC721", collectionName = "Mutant Ape Yacht Club", collectionImage = null,
    ),
    ApiNft(
        network = "eth-mainnet", chainName = "Ethereum",
        contractAddress = "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB",
        tokenId = "7804", name = "CryptoPunk #7804",
        description = "One of 10,000 unique CryptoPunks.",
        image = "https://i.seadn.io/gae/ZWEV3wEsBl5ETCfGKgt-Ql98W4bDpVwv0LJOmpOCIJ9pSZEH0OKIL5KrAXJIlz5BmBNjt3elDZ6LzfR3JfBGhJlcwgZyYaOC3cs?w=500",
        tokenType = "ERC721", collectionName = "CryptoPunks", collectionImage = null,
    ),
    ApiNft(
        network = "arb-mainnet", chainName = "Arbitrum",
        contractAddress = "0x912CE59144191C1D603F1d49E6F13b8e665F5695",
        tokenId = "142", name = "Arbitrum Odyssey #142",
        description = "Commemorative NFT from the Arbitrum Odyssey campaign.",
        image = "https://i.seadn.io/gcs/files/81b1247b14d9f69a0f76cf698a2e2106.png?w=500",
        tokenType = "ERC721", collectionName = "Arbitrum Odyssey", collectionImage = null,
    ),
    ApiNft(
        network = "base-mainnet", chainName = "Base",
        contractAddress = "0xd4307E0acD12CF46fD6cf93BC264f6D5Aa0a8D46",
        tokenId = "55", name = "Base Day One #55",
        description = "Base launch commemorative NFT.",
        image = "https://i.seadn.io/gcs/files/b13b67cf6cbd36c8080f9f0e08e54f75.png?w=500",
        tokenType = "ERC721", collectionName = "Base, Pair Introduced", collectionImage = null,
    ),
    ApiNft(
        network = "opt-mainnet", chainName = "Optimism",
        contractAddress = "0x2421c137FfBb0CcABBaFE18a8B6B75e1B1489a9C",
        tokenId = "201", name = "Optimism Quest #201",
        description = "Optimism ecosystem participation reward.",
        image = "https://i.seadn.io/gcs/files/d1d3d48b9e72a7eddf7de00a1d3af88f.png?w=500",
        tokenType = "ERC721", collectionName = "Optimism Quests", collectionImage = null,
    ),
)
