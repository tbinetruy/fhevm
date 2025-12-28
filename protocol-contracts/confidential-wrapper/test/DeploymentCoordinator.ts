import { ethers } from "hardhat";
import { expect } from "chai";
import { getSigners, Signers } from "./signers";
import { deployWrapperFixture, deployTestERC20Fixture, deployAdminProviderFixture } from "./fixtures";
import { deployConfidentialToken, deployConfidentialETH } from "./utils";
import type { DeploymentCoordinator, AdminProvider, TestERC20, ConfidentialWrapper, FeeManager } from "../types";

describe("DeploymentCoordinator - ConfidentialWrapper Deployment", function () {
  let signers: Signers;
  let coordinator: DeploymentCoordinator;
  let adminProvider: AdminProvider;

  before(async function () {
    signers = await getSigners();
  });

  beforeEach(async function () {
    ({ coordinator, adminProvider } = await deployWrapperFixture(signers));
  });

  describe("ERC20 Wrapper Deployment", function () {
    it("should deploy ConfidentialWrapper for ERC20 token", async function () {
      const usdc = await deployTestERC20Fixture("USDC", 6);
      const usdcAddress = await usdc.getAddress();

      const adminProviderAddress = await coordinator.adminProvider();
      const adminProviderContract = await ethers.getContractAt("AdminProvider", adminProviderAddress);
      const feeManagerAddress = await adminProviderContract.feeManager();
      const feeManager = await ethers.getContractAt("FeeManager", feeManagerAddress);
      const deployFee = await feeManager.getDeployFee(ethers.ZeroAddress);

      const tx = await coordinator.connect(signers.alice).deploy(usdcAddress, { value: deployFee });
      await tx.wait();

      const wrapperAddress = await coordinator.getWrapper(usdcAddress);
      expect(wrapperAddress).to.not.equal(ethers.ZeroAddress);

      const wrapper = await ethers.getContractAt("ConfidentialWrapper", wrapperAddress);
      expect(await wrapper.underlying()).to.equal(usdcAddress);
      expect(await wrapper.name()).to.equal("Confidential USDC");
      expect(await wrapper.symbol()).to.equal("cUSDC");
      expect(await wrapper.decimals()).to.equal(6);
      expect(await wrapper.rate()).to.equal(1n); // 6 decimals, rate = 1
    });

    it("should emit WrapperDeployed event with correct parameters", async function () {
      const usdc = await deployTestERC20Fixture("USDC", 6);
      const usdcAddress = await usdc.getAddress();

      const adminProviderAddress = await coordinator.adminProvider();
      const adminProviderContract = await ethers.getContractAt("AdminProvider", adminProviderAddress);
      const feeManagerAddress = await adminProviderContract.feeManager();
      const feeManager = await ethers.getContractAt("FeeManager", feeManagerAddress);
      const deployFee = await feeManager.getDeployFee(ethers.ZeroAddress);

      const tx = await coordinator.connect(signers.alice).deploy(usdcAddress, { value: deployFee });
      const receipt = await tx.wait();

      const wrapperAddress = await coordinator.getWrapper(usdcAddress);

      await expect(tx)
        .to.emit(coordinator, "WrapperDeployed")
        .withArgs(
          usdcAddress,
          wrapperAddress,
          "USDC",
          "USDC",
          6,
          signers.alice.address
        );
    });

    it("should handle tokens with different decimals (18 decimals -> rate 10^12)", async function () {
      const dai = await deployTestERC20Fixture("DAI", 18);
      const daiAddress = await dai.getAddress();

      const adminProviderAddress = await coordinator.adminProvider();
      const adminProviderContract = await ethers.getContractAt("AdminProvider", adminProviderAddress);
      const feeManagerAddress = await adminProviderContract.feeManager();
      const feeManager = await ethers.getContractAt("FeeManager", feeManagerAddress);
      const deployFee = await feeManager.getDeployFee(ethers.ZeroAddress);

      await coordinator.deploy(daiAddress, { value: deployFee });

      const wrapperAddress = await coordinator.getWrapper(daiAddress);
      const wrapper = await ethers.getContractAt("ConfidentialWrapper", wrapperAddress);

      expect(await wrapper.decimals()).to.equal(6); // Max decimals capped at 6
      expect(await wrapper.rate()).to.equal(10n ** 12n); // 18 - 6 = 12
    });

    it("should handle tokens with 4 decimals (rate = 1)", async function () {
      const token = await deployTestERC20Fixture("TOK", 4);
      const tokenAddress = await token.getAddress();

      const adminProviderAddress = await coordinator.adminProvider();
      const adminProviderContract = await ethers.getContractAt("AdminProvider", adminProviderAddress);
      const feeManagerAddress = await adminProviderContract.feeManager();
      const feeManager = await ethers.getContractAt("FeeManager", feeManagerAddress);
      const deployFee = await feeManager.getDeployFee(ethers.ZeroAddress);

      await coordinator.deploy(tokenAddress, { value: deployFee });

      const wrapperAddress = await coordinator.getWrapper(tokenAddress);
      const wrapper = await ethers.getContractAt("ConfidentialWrapper", wrapperAddress);

      expect(await wrapper.decimals()).to.equal(4);
      expect(await wrapper.rate()).to.equal(1n);
    });

    it("should prevent duplicate deployment for same token", async function () {
      const usdc = await deployTestERC20Fixture("USDC", 6);
      const usdcAddress = await usdc.getAddress();

      const adminProviderAddress = await coordinator.adminProvider();
      const adminProviderContract = await ethers.getContractAt("AdminProvider", adminProviderAddress);
      const feeManagerAddress = await adminProviderContract.feeManager();
      const feeManager = await ethers.getContractAt("FeeManager", feeManagerAddress);
      const deployFee = await feeManager.getDeployFee(ethers.ZeroAddress);

      await coordinator.deploy(usdcAddress, { value: deployFee });

      await expect(
        coordinator.deploy(usdcAddress, { value: deployFee })
      ).to.be.revertedWithCustomError(coordinator, "WrapperAlreadyExists");
    });

    it("should prevent deploying for non-existent token address", async function () {
      const fakeTokenAddress = ethers.Wallet.createRandom().address;

      const adminProviderAddress = await coordinator.adminProvider();
      const adminProviderContract = await ethers.getContractAt("AdminProvider", adminProviderAddress);
      const feeManagerAddress = await adminProviderContract.feeManager();
      const feeManager = await ethers.getContractAt("FeeManager", feeManagerAddress);
      const deployFee = await feeManager.getDeployFee(ethers.ZeroAddress);

      await expect(
        coordinator.deploy(fakeTokenAddress, { value: deployFee })
      ).to.be.revertedWithCustomError(coordinator, "TokenMustExist");
    });
  });

  describe("ETH Wrapper Deployment", function () {
    it("should deploy ConfidentialWrapper for ETH (address(0))", async function () {
      const adminProviderAddress = await coordinator.adminProvider();
      const adminProviderContract = await ethers.getContractAt("AdminProvider", adminProviderAddress);
      const feeManagerAddress = await adminProviderContract.feeManager();
      const feeManager = await ethers.getContractAt("FeeManager", feeManagerAddress);
      const deployFee = await feeManager.getDeployFee(ethers.ZeroAddress);

      await coordinator.deploy(ethers.ZeroAddress, { value: deployFee });

      const wrapperAddress = await coordinator.getWrapper(ethers.ZeroAddress);
      expect(wrapperAddress).to.not.equal(ethers.ZeroAddress);

      const wrapper = await ethers.getContractAt("ConfidentialWrapper", wrapperAddress);
      expect(await wrapper.underlying()).to.equal(ethers.ZeroAddress);
      expect(await wrapper.name()).to.equal("Confidential Ethereum");
      expect(await wrapper.symbol()).to.equal("cETH");
      expect(await wrapper.decimals()).to.equal(6); // Max decimals
      expect(await wrapper.rate()).to.equal(10n ** 12n); // 18 - 6 = 12
    });

    it("should emit WrapperDeployed event for ETH with correct parameters", async function () {
      const adminProviderAddress = await coordinator.adminProvider();
      const adminProviderContract = await ethers.getContractAt("AdminProvider", adminProviderAddress);
      const feeManagerAddress = await adminProviderContract.feeManager();
      const feeManager = await ethers.getContractAt("FeeManager", feeManagerAddress);
      const deployFee = await feeManager.getDeployFee(ethers.ZeroAddress);

      const tx = await coordinator.connect(signers.alice).deploy(ethers.ZeroAddress, { value: deployFee });
      await tx.wait();

      const wrapperAddress = await coordinator.getWrapper(ethers.ZeroAddress);

      await expect(tx)
        .to.emit(coordinator, "WrapperDeployed")
        .withArgs(
          ethers.ZeroAddress,
          wrapperAddress,
          "Ethereum",
          "ETH",
          18,
          signers.alice.address
        );
    });
  });

  describe("Deployment Fee Handling", function () {
    it("should require exact deployment fee", async function () {
      const usdc = await deployTestERC20Fixture("USDC", 6);
      const usdcAddress = await usdc.getAddress();

      const adminProviderAddress = await coordinator.adminProvider();
      const adminProviderContract = await ethers.getContractAt("AdminProvider", adminProviderAddress);
      const feeManagerAddress = await adminProviderContract.feeManager();
      const feeManager = await ethers.getContractAt("FeeManager", feeManagerAddress);
      const deployFee = await feeManager.getDeployFee(ethers.ZeroAddress);

      // Too little
      await expect(
        coordinator.deploy(usdcAddress, { value: deployFee - 1n })
      ).to.be.revertedWithCustomError(coordinator, "IncorrectDeployFee");

      // Too much
      await expect(
        coordinator.deploy(usdcAddress, { value: deployFee + 1n })
      ).to.be.revertedWithCustomError(coordinator, "IncorrectDeployFee");
    });

    it("should transfer fee to royalties recipient", async function () {
      const usdc = await deployTestERC20Fixture("USDC", 6);
      const usdcAddress = await usdc.getAddress();

      const adminProviderAddress = await coordinator.adminProvider();
      const adminProviderContract = await ethers.getContractAt("AdminProvider", adminProviderAddress);
      const feeManagerAddress = await adminProviderContract.feeManager();
      const feeManager = await ethers.getContractAt("FeeManager", feeManagerAddress);
      const deployFee = await feeManager.getDeployFee(ethers.ZeroAddress);
      const feeRecipient = await feeManager.feeRecipient();

      const balanceBefore = await ethers.provider.getBalance(feeRecipient);

      await coordinator.deploy(usdcAddress, { value: deployFee });

      const balanceAfter = await ethers.provider.getBalance(feeRecipient);
      expect(balanceAfter - balanceBefore).to.equal(deployFee);
    });
  });

  describe("Proxy Pattern Verification", function () {
    it("should deploy as upgradeable proxy (ERC1967)", async function () {
      const usdc = await deployTestERC20Fixture("USDC", 6);
      const usdcAddress = await usdc.getAddress();

      const adminProviderAddress = await coordinator.adminProvider();
      const adminProviderContract = await ethers.getContractAt("AdminProvider", adminProviderAddress);
      const feeManagerAddress = await adminProviderContract.feeManager();
      const feeManager = await ethers.getContractAt("FeeManager", feeManagerAddress);
      const deployFee = await feeManager.getDeployFee(ethers.ZeroAddress);

      await coordinator.deploy(usdcAddress, { value: deployFee });

      const wrapperAddress = await coordinator.getWrapper(usdcAddress);

      // Verify it's a proxy pointing to the implementation
      // ERC1967 implementation slot: keccak256("eip1967.proxy.implementation") - 1
      const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
      const implementation = await ethers.provider.getStorage(wrapperAddress, implementationSlot);

      expect("0x" + implementation.slice(26)).to.equal(
        (await coordinator.wrapperImplementation()).toLowerCase()
      );
    });

    it("should initialize proxy correctly with all parameters", async function () {
      const usdc = await deployTestERC20Fixture("USDC", 6);
      const usdcAddress = await usdc.getAddress();

      const adminProviderAddress = await coordinator.adminProvider();
      const adminProviderContract = await ethers.getContractAt("AdminProvider", adminProviderAddress);
      const feeManagerAddress = await adminProviderContract.feeManager();
      const feeManager = await ethers.getContractAt("FeeManager", feeManagerAddress);
      const deployFee = await feeManager.getDeployFee(ethers.ZeroAddress);

      await coordinator.deploy(usdcAddress, { value: deployFee });

      const wrapperAddress = await coordinator.getWrapper(usdcAddress);
      const wrapper = await ethers.getContractAt("ConfidentialWrapper", wrapperAddress);

      // Verify initialization
      expect(await wrapper.name()).to.equal("Confidential USDC");
      expect(await wrapper.symbol()).to.equal("cUSDC");
      expect(await wrapper.underlying()).to.equal(usdcAddress);
      expect(await wrapper.owner()).to.equal(await adminProvider.owner());
    });

    it("should allow owner to upgrade wrapper", async function () {
      const usdc = await deployTestERC20Fixture("USDC", 6);
      const usdcAddress = await usdc.getAddress();

      const adminProviderAddress = await coordinator.adminProvider();
      const adminProviderContract = await ethers.getContractAt("AdminProvider", adminProviderAddress);
      const feeManagerAddress = await adminProviderContract.feeManager();
      const feeManager = await ethers.getContractAt("FeeManager", feeManagerAddress);
      const deployFee = await feeManager.getDeployFee(ethers.ZeroAddress);

      await coordinator.deploy(usdcAddress, { value: deployFee });

      const wrapperAddress = await coordinator.getWrapper(usdcAddress);
      const wrapper = await ethers.getContractAt("ConfidentialWrapper", wrapperAddress);

      // Deploy new implementation
      const ConfidentialWrapperFactory = await ethers.getContractFactory("ConfidentialWrapper");
      const newImpl = await ConfidentialWrapperFactory.deploy();
      await newImpl.waitForDeployment();

      // Owner should be adminProvider.owner()
      const adminProviderOwner = await adminProvider.owner();
      const ownerSigner = await ethers.getSigner(adminProviderOwner);

      // Upgrade should work for owner
      await expect(
        wrapper.connect(ownerSigner).upgradeToAndCall(
          await newImpl.getAddress(),
          "0x"
        )
      ).to.not.be.reverted;
    });
  });

  describe("Wrapper Query Functions", function () {
    it("should return wrapper address via getWrapper()", async function () {
      const usdc = await deployTestERC20Fixture("USDC", 6);
      const usdcAddress = await usdc.getAddress();

      const adminProviderAddress = await coordinator.adminProvider();
      const adminProviderContract = await ethers.getContractAt("AdminProvider", adminProviderAddress);
      const feeManagerAddress = await adminProviderContract.feeManager();
      const feeManager = await ethers.getContractAt("FeeManager", feeManagerAddress);
      const deployFee = await feeManager.getDeployFee(ethers.ZeroAddress);

      await coordinator.deploy(usdcAddress, { value: deployFee });

      const wrapperAddress = await coordinator.getWrapper(usdcAddress);
      expect(wrapperAddress).to.not.equal(ethers.ZeroAddress);

      const wrapper = await ethers.getContractAt("ConfidentialWrapper", wrapperAddress);
      expect(await wrapper.underlying()).to.equal(usdcAddress);
    });

    it("should return true for wrapperExists() after deployment", async function () {
      const usdc = await deployTestERC20Fixture("USDC", 6);
      const usdcAddress = await usdc.getAddress();

      expect(await coordinator.wrapperExists(usdcAddress)).to.be.false;

      const adminProviderAddress = await coordinator.adminProvider();
      const adminProviderContract = await ethers.getContractAt("AdminProvider", adminProviderAddress);
      const feeManagerAddress = await adminProviderContract.feeManager();
      const feeManager = await ethers.getContractAt("FeeManager", feeManagerAddress);
      const deployFee = await feeManager.getDeployFee(ethers.ZeroAddress);

      await coordinator.deploy(usdcAddress, { value: deployFee });

      expect(await coordinator.wrapperExists(usdcAddress)).to.be.true;
    });

    it("should return zero address for non-deployed wrapper", async function () {
      const fakeToken = ethers.Wallet.createRandom().address;
      expect(await coordinator.getWrapper(fakeToken)).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Wrapper Implementation Management", function () {
    it("should set wrapper implementation via setWrapperImplementation()", async function () {
      const ConfidentialWrapperFactory = await ethers.getContractFactory("ConfidentialWrapper");
      const newImpl = await ConfidentialWrapperFactory.deploy();
      await newImpl.waitForDeployment();

      await coordinator.setWrapperImplementation(await newImpl.getAddress());
      expect(await coordinator.wrapperImplementation()).to.equal(await newImpl.getAddress());
    });

    it("should emit event when implementation updated", async function () {
      const ConfidentialWrapperFactory = await ethers.getContractFactory("ConfidentialWrapper");
      const newImpl = await ConfidentialWrapperFactory.deploy();
      await newImpl.waitForDeployment();

      const oldImplementation = await coordinator.wrapperImplementation();

      await expect(coordinator.setWrapperImplementation(await newImpl.getAddress()))
        .to.emit(coordinator, "WrapperImplementationUpdated")
        .withArgs(oldImplementation, await newImpl.getAddress());
    });

    it("should prevent setting zero address as implementation", async function () {
      await expect(
        coordinator.setWrapperImplementation(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(coordinator, "ZeroAddressImplementation");
    });
  });

  describe("ConfidentialWrapper - Wrap Function", function () {
    it("should wrap ERC20 tokens", async function () {
      const usdc = await deployTestERC20Fixture("USDC", 6);
      await usdc.mint(signers.alice.address, ethers.parseUnits("1000", 6));

      const { wrapper } = await deployConfidentialToken(coordinator, usdc, signers.alice);

      const amount = ethers.parseUnits("100", 6);
      const wrapperAddress = await wrapper.getAddress();

      await usdc.connect(signers.alice).approve(wrapperAddress, amount);
      await wrapper.connect(signers.alice).wrap(signers.alice.address, amount);

      // Verify balance increased
      const totalSupply = await wrapper.totalSupply();
      expect(totalSupply).to.equal(amount);
    });

    it("should revert when wrapping ETH via wrap() instead of wrapETH()", async function () {
      const { wrapper } = await deployConfidentialETH(coordinator, signers.alice);
      const amount = ethers.parseEther("1.0");

      // wrap() is not payable, so sending ETH reverts at Solidity level before our custom error
      await expect(
        wrapper.connect(signers.alice).wrap(signers.alice.address, amount, { value: amount })
      ).to.be.reverted;
    });
  });

  describe("ConfidentialWrapper - WrapETH Function", function () {
    it("should wrap ETH via wrapETH()", async function () {
      const { wrapper } = await deployConfidentialETH(coordinator, signers.alice);
      const amount = ethers.parseEther("1.0");
      const rate = await wrapper.rate();

      await wrapper.connect(signers.alice).wrapETH(signers.alice.address, amount, { value: amount });

      const totalSupply = await wrapper.totalSupply();
      expect(totalSupply).to.equal(amount / rate);
    });

    it("should require msg.value equals amount", async function () {
      const { wrapper } = await deployConfidentialETH(coordinator, signers.alice);
      const amount = ethers.parseEther("1.0");

      await expect(
        wrapper.connect(signers.alice).wrapETH(signers.alice.address, amount, { value: amount + 1n })
      ).to.be.revertedWithCustomError(wrapper, "IncorrectEthAmount");

      await expect(
        wrapper.connect(signers.alice).wrapETH(signers.alice.address, amount, { value: amount - 1n })
      ).to.be.revertedWithCustomError(wrapper, "IncorrectEthAmount");
    });

    it("should mint correct amount based on rate", async function () {
      const { wrapper } = await deployConfidentialETH(coordinator, signers.alice);
      const amount = ethers.parseEther("1.0");
      const rate = await wrapper.rate();

      expect(rate).to.equal(10n ** 12n); // ETH: 18 decimals -> 6 decimals

      await wrapper.connect(signers.alice).wrapETH(signers.alice.address, amount, { value: amount });

      const totalSupply = await wrapper.totalSupply();
      const expectedMinted = amount / rate;

      expect(totalSupply).to.equal(expectedMinted);
    });
  });
});
